const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv(file) {
  const target = path.resolve(file);
  if (!fs.existsSync(target)) return;
  for (const line of fs.readFileSync(target, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadEnv(".env.local");
loadEnv(".env.d1-archive");

const args = new Set(process.argv.slice(2));
const throughArg = process.argv.find((arg) => arg.startsWith("--through="));
const dryRun = args.has("--dry-run");
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const TERMINAL = new Set(["paid", "completed", "closed", "delivered", "refunded", "voided", "cancelled"]);

function manilaDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

function yesterdayManila() {
  return manilaDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value) {
  return value == null ? null : String(value);
}

function json(value) {
  return JSON.stringify(value ?? {});
}

function statusOf(row) {
  if (row?.voided_at) return "voided";
  return String(row?.status || "").trim().toLowerCase();
}

function isTerminal(row) {
  return TERMINAL.has(statusOf(row));
}

function businessDate(row) {
  const explicit = row.receipt_date || row.business_date || row.order_date;
  if (explicit && /^\d{4}-\d{2}-\d{2}/.test(String(explicit))) return String(explicit).slice(0, 10);
  return manilaDate(row.paid_at || row.completed_at || row.created_at);
}

function grossOf(row) {
  return number(row.gross_amount ?? row.gross_sales ?? row.subtotal ?? row.total);
}

function discountOf(row) {
  return number(row.discount_amount ?? row.discount ?? row.discounts);
}

function refundOf(row) {
  const explicit = number(row.refund_amount ?? row.refund ?? row.refunds);
  if (explicit) return explicit;
  return ["refunded", "voided"].includes(statusOf(row)) ? number(row.net_amount ?? row.total) : 0;
}

function netOf(row) {
  if (row.net_amount != null) return Math.max(0, number(row.net_amount));
  return Math.max(0, grossOf(row) - discountOf(row) - refundOf(row));
}

async function fetchAll(supabase, table, configure, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select("*").range(from, from + pageSize - 1);
    query = configure ? configure(query) : query;
    const { data, error } = await query;
    if (error) {
      if (["42P01", "PGRST205"].includes(error.code)) return [];
      throw new Error(`${table}: ${error.message}`);
    }
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function fetchItems(supabase, orderIds) {
  const rows = [];
  for (let index = 0; index < orderIds.length; index += 150) {
    const ids = orderIds.slice(index, index + 150);
    const { data, error } = await supabase.from("order_items").select("*").in("order_id", ids);
    if (error) throw new Error(`order_items: ${error.message}`);
    rows.push(...(data || []));
  }
  return rows;
}

function webItems(order) {
  if (Array.isArray(order.items)) return order.items;
  try {
    const parsed = JSON.parse(order.items || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function itemQuantity(item) {
  return Math.max(0, number(item.quantity ?? item.qty ?? 1));
}

function itemNet(item) {
  const qty = itemQuantity(item);
  return number(item.net_amount ?? item.line_total ?? item.total ?? item.subtotal ?? number(item.price ?? item.unit_price) * qty);
}

function archiveOrder(row, sourceType) {
  return {
    source_id: String(row.id),
    source_type: sourceType,
    business_date: businessDate(row),
    created_at: text(row.created_at) || new Date().toISOString(),
    paid_at: text(row.paid_at || row.completed_at),
    store_id: text(row.store_id),
    branch_id: text(row.branch_id),
    receipt_number: text(row.receipt_number || row.order_number || row.reference_no),
    order_number: text(row.order_number || row.receipt_number || row.reference_no),
    status: text(row.status),
    payment_method: text(row.payment_method || row.payment_type),
    customer_id: text(row.customer_id),
    loyalty_member_id: text(row.loyalty_member_id),
    gross_amount: grossOf(row),
    discount_amount: discountOf(row),
    refund_amount: refundOf(row),
    net_amount: netOf(row),
    payload_json: json(row),
  };
}

function archiveItem(item, parent) {
  const quantity = itemQuantity(item);
  const gross = number(item.gross_amount ?? item.line_total ?? itemNet(item));
  const discount = number(item.discount_amount);
  const refund = number(item.refund_amount);
  return {
    source_id: String(item.id),
    order_id: String(item.order_id),
    business_date: parent.business_date,
    store_id: text(parent.store_id || parent.branch_id),
    menu_item_id: text(item.menu_item_id || item.item_id),
    item_name: text(item.item_name || item.name || item.title),
    category_name: text(item.category_name || item.category),
    quantity,
    gross_amount: gross,
    discount_amount: discount,
    refund_amount: refund,
    net_amount: Math.max(0, number(item.net_amount ?? item.line_total ?? gross - discount - refund)),
    payload_json: json(item),
  };
}

function archiveWebItem(item, order, index) {
  const quantity = itemQuantity(item);
  const net = itemNet(item);
  const payload = { ...item, order_id: order.id };
  return {
    source_id: `web:${order.id}:${index}`,
    order_id: String(order.id),
    business_date: businessDate(order),
    store_id: text(order.store_id || order.branch_id),
    menu_item_id: text(item.menu_item_id || item.id),
    item_name: text(item.item_name || item.name || item.title),
    category_name: text(item.category_name || item.category || "Web Orders"),
    quantity,
    gross_amount: net,
    discount_amount: 0,
    refund_amount: 0,
    net_amount: net,
    payload_json: json(payload),
  };
}

function summaries(orders) {
  const daily = new Map();
  const payments = new Map();
  for (const order of orders) {
    const store = order.store_id || order.branch_id || "";
    const dailyKey = `${order.business_date}|${store}`;
    const current = daily.get(dailyKey) || {
      business_date: order.business_date, store_id: store, gross_amount: 0, discount_amount: 0,
      refund_amount: 0, net_amount: 0, order_count: 0, updated_at: new Date().toISOString(),
    };
    current.gross_amount += order.gross_amount;
    current.discount_amount += order.discount_amount;
    current.refund_amount += order.refund_amount;
    current.net_amount += order.net_amount;
    current.order_count += 1;
    daily.set(dailyKey, current);

    const method = order.payment_method || "Unspecified";
    const paymentKey = `${dailyKey}|${method}`;
    const payment = payments.get(paymentKey) || {
      business_date: order.business_date, store_id: store, payment_method: method,
      amount: 0, transaction_count: 0, updated_at: new Date().toISOString(),
    };
    payment.amount += order.net_amount;
    payment.transaction_count += 1;
    payments.set(paymentKey, payment);
  }
  return { daily: [...daily.values()], payments: [...payments.values()] };
}

async function sendBatch(apiUrl, token, table, rows) {
  for (let index = 0; index < rows.length; index += 500) {
    const response = await fetch(`${apiUrl}/v1/archive/batch`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ table, rows: rows.slice(index, index + 500) }),
    });
    if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase URL or service role key is missing.");
  const archiveThrough = throughArg ? throughArg.split("=")[1] : yesterdayManila();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(archiveThrough)) throw new Error("--through must use YYYY-MM-DD.");
  const throughIso = `${archiveThrough}T23:59:59.999+08:00`;
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const [allOrders, allWebOrders, shifts, inventoryDaily, inventoryTransactions, auditLogs, notifications] = await Promise.all([
    fetchAll(supabase, "orders", (query) => query.lte("created_at", throughIso).order("created_at")),
    fetchAll(supabase, "web_orders", (query) => query.lte("created_at", throughIso).order("created_at")),
    fetchAll(supabase, "cashier_pos", (query) => query.lte("created_at", throughIso).in("mode", ["close", "end_day"]).order("created_at")),
    fetchAll(supabase, "finance_daily_inventory_entries", (query) => query.lte("inventory_date", archiveThrough).order("inventory_date")),
    fetchAll(supabase, "inventory_transactions", (query) => query.lte("created_at", throughIso).order("created_at")),
    fetchAll(supabase, "audit_log", (query) => query.lte("created_at", throughIso).order("created_at")),
    fetchAll(supabase, "notifications", (query) => query.lte("created_at", throughIso).order("created_at")),
  ]);

  const orders = allOrders.filter((row) => isTerminal(row) && businessDate(row) <= archiveThrough);
  const convertedWebIds = new Set(orders.map((row) => text(row.source_web_order_id)).filter(Boolean));
  const webOrders = allWebOrders.filter(
    (row) => isTerminal(row) && businessDate(row) <= archiveThrough && !convertedWebIds.has(String(row.id)),
  );
  const archivedOrders = [...orders.map((row) => archiveOrder(row, "POS")), ...webOrders.map((row) => archiveOrder(row, "WEB"))];
  const parentById = new Map(archivedOrders.map((row) => [row.source_id, row]));
  const orderItems = await fetchItems(supabase, orders.map((row) => row.id));
  const archivedItems = orderItems
    .filter((item) => parentById.has(String(item.order_id)))
    .map((item) => archiveItem(item, parentById.get(String(item.order_id))));
  webOrders.forEach((order) => webItems(order).forEach((item, index) => archivedItems.push(archiveWebItem(item, order, index))));

  const archivedShifts = shifts.filter((row) => businessDate(row) <= archiveThrough).map((row) => ({
    source_id: String(row.id), business_date: businessDate(row), store_id: text(row.store_id),
    cashier_id: text(row.cashier_id), mode: text(row.mode), created_at: text(row.created_at),
    cash_total: number(row.cash_total), payload_json: json(row),
  }));
  const archivedInventoryDaily = inventoryDaily.map((row) => ({
    source_id: String(row.id), inventory_date: text(row.inventory_date), store_id: text(row.store_id),
    inventory_item_id: text(row.inventory_item_id), ending_quantity: number(row.ending_quantity), payload_json: json(row),
  }));
  const archivedInventoryTransactions = inventoryTransactions
    .filter((row) => manilaDate(row.created_at) <= archiveThrough)
    .map((row) => ({
    source_id: String(row.id), business_date: manilaDate(row.created_at), store_id: text(row.store_id),
    inventory_item_id: text(row.inventory_item_id), transaction_type: text(row.transaction_type),
    quantity_effect: number(row.quantity_effect), created_at: text(row.created_at), payload_json: json(row),
    }));
  const archivedAudit = auditLogs.filter((row) => manilaDate(row.created_at) <= archiveThrough).map((row) => ({
    source_id: String(row.id), business_date: manilaDate(row.created_at), store_id: text(row.store_id),
    actor_user_id: text(row.actor_user_id || row.user_id), entity: text(row.entity || row.entity_type),
    action: text(row.action), created_at: text(row.created_at), payload_json: json(row),
  }));
  const archivedNotifications = notifications
    .filter((row) => manilaDate(row.created_at) <= archiveThrough)
    .map((row) => ({
    source_id: String(row.id), business_date: manilaDate(row.created_at), store_id: text(row.store_id),
    target_user_id: text(row.target_user_id || row.user_id), type: text(row.type),
    created_at: text(row.created_at), read_at: text(row.read_at), payload_json: json(row),
  }));
  const summary = summaries(archivedOrders);
  const datasets = {
    archive_orders: archivedOrders,
    archive_order_items: archivedItems,
    archive_shifts: archivedShifts,
    archive_inventory_daily: archivedInventoryDaily,
    archive_inventory_transactions: archivedInventoryTransactions,
    archive_audit_logs: archivedAudit,
    archive_notifications: archivedNotifications,
    sales_daily_summary: summary.daily,
    sales_payment_daily: summary.payments,
  };

  console.log(`Archive through ${archiveThrough}${dryRun ? " (dry run)" : ""}`);
  for (const [table, rows] of Object.entries(datasets)) console.log(`${table}: ${rows.length}`);
  console.log(`Net sales: ${archivedOrders.reduce((sum, row) => sum + row.net_amount, 0).toFixed(2)}`);
  if (dryRun) return;

  const apiUrl = String(process.env.D1_ARCHIVE_API_URL || "").replace(/\/$/, "");
  const token = process.env.D1_ARCHIVE_API_TOKEN;
  if (!apiUrl || !token) throw new Error("D1_ARCHIVE_API_URL or D1_ARCHIVE_API_TOKEN is missing.");
  for (const [table, rows] of Object.entries(datasets)) await sendBatch(apiUrl, token, table, rows);
  const complete = await fetch(`${apiUrl}/v1/archive/complete`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ archiveThrough }),
  });
  if (!complete.ok) throw new Error(`archive complete: ${complete.status} ${await complete.text()}`);
  console.log(`D1 archive synchronized through ${archiveThrough}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
