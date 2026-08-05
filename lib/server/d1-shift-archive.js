import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

const TERMINAL = new Set(["paid", "completed", "closed", "delivered", "refunded", "voided", "cancelled"]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stable(value[key]);
      return result;
    }, {});
  }
  return value;
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function manilaDate(value) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function orderStatus(row) {
  return String(row?.voided_at ? "voided" : row?.status || "").toLowerCase();
}

function orderAmounts(row) {
  const gross = num(row.gross_amount ?? row.gross_sales ?? row.subtotal ?? row.total);
  const discounts = num(row.discount_amount ?? row.discount ?? row.discounts);
  const explicitRefund = num(row.refund_amount ?? row.refund ?? row.refunds);
  const refunds = explicitRefund || (["refunded", "voided"].includes(orderStatus(row)) ? num(row.net_amount ?? row.total) : 0);
  const net = row.net_amount == null ? Math.max(0, gross - discounts - refunds) : Math.max(0, num(row.net_amount));
  return { gross, discounts, refunds, net };
}

function archiveOrder(row, sourceType, businessDate) {
  const amounts = orderAmounts(row);
  return {
    source_id: String(row.id), source_type: sourceType, business_date: businessDate,
    created_at: row.created_at || new Date().toISOString(), paid_at: row.paid_at || row.completed_at || null,
    store_id: row.store_id || null, branch_id: row.branch_id || null,
    receipt_number: row.receipt_number || row.order_number || row.reference_no || null,
    order_number: row.order_number || row.receipt_number || row.reference_no || null,
    status: row.status || null, payment_method: row.payment_method || row.payment_type || null,
    customer_id: row.customer_id || null, loyalty_member_id: row.loyalty_member_id || null,
    gross_amount: amounts.gross, discount_amount: amounts.discounts, refund_amount: amounts.refunds,
    net_amount: amounts.net, payload_json: JSON.stringify(row),
  };
}

function archiveItem(item, parent) {
  const quantity = Math.max(0, num(item.quantity ?? item.qty ?? 1));
  const gross = num(item.gross_amount ?? item.line_total ?? item.total ?? item.subtotal ?? num(item.price ?? item.unit_price) * quantity);
  const discount = num(item.discount_amount);
  const refund = num(item.refund_amount);
  return {
    source_id: String(item.id), order_id: String(item.order_id), business_date: parent.business_date,
    store_id: parent.store_id || parent.branch_id || null, menu_item_id: item.menu_item_id || item.item_id || null,
    item_name: item.item_name || item.name || item.title || null, category_name: item.category_name || item.category || null,
    quantity, gross_amount: gross, discount_amount: discount, refund_amount: refund,
    net_amount: Math.max(0, num(item.net_amount ?? item.line_total ?? gross - discount - refund)), payload_json: JSON.stringify(item),
  };
}

function webItems(order) {
  if (Array.isArray(order.items)) return order.items;
  try { const parsed = JSON.parse(order.items || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function archiveWebItem(item, order, index, businessDate) {
  const quantity = Math.max(0, num(item.quantity ?? item.qty ?? 1));
  const net = num(item.net_amount ?? item.line_total ?? item.total ?? item.subtotal ?? num(item.price ?? item.unit_price) * quantity);
  return {
    source_id: `web:${order.id}:${index}`, order_id: String(order.id), business_date: businessDate,
    store_id: order.store_id || order.branch_id || null, menu_item_id: item.menu_item_id || item.id || null,
    item_name: item.item_name || item.name || item.title || null, category_name: item.category_name || item.category || "Web Orders",
    quantity, gross_amount: net, discount_amount: 0, refund_amount: 0, net_amount: net,
    payload_json: JSON.stringify({ ...item, order_id: order.id }),
  };
}

async function fetchRows(client, table, configure) {
  let query = client.from(table).select("*");
  query = configure(query);
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

async function archiveRequest(path, body) {
  const base = String(process.env.D1_ARCHIVE_API_URL || "").replace(/\/$/, "");
  const token = process.env.D1_ARCHIVE_API_TOKEN;
  if (!base || !token) throw new Error("D1 archive environment variables are missing.");
  const response = await fetch(`${base}${path}`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body), cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error || `D1 archive returned ${response.status}.`), { payload });
  return payload;
}

export async function archiveClosedShift(shiftId) {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: shift, error: shiftError } = await client.from("cashier_pos").select("*").eq("id", shiftId).maybeSingle();
  if (shiftError || !shift) throw new Error(shiftError?.message || "Closed shift was not found.");
  if (!["close", "end_day"].includes(String(shift.mode || "").toLowerCase())) throw new Error("Only closed shifts can be archived.");

  const { data: queued } = await client.from("sales_archive_batches").select("*").eq("shift_id", String(shiftId)).maybeSingle();
  let openedAt = queued?.opened_at;
  if (!openedAt) {
    let openQuery = client.from("cashier_pos").select("created_at").eq("store_id", shift.store_id)
      .eq("mode", "open").lte("created_at", shift.created_at).order("created_at", { ascending: false }).limit(1);
    if (shift.cashier_id) openQuery = openQuery.eq("cashier_id", shift.cashier_id);
    const { data: opens } = await openQuery;
    openedAt = opens?.[0]?.created_at || shift.created_at;
  }
  const closedAt = shift.created_at;
  const businessDate = manilaDate(openedAt);
  await client.from("sales_archive_batches").upsert({
    shift_id: String(shiftId), store_id: shift.store_id, cashier_id: shift.cashier_id || null,
    opened_at: openedAt, closed_at: closedAt, business_date: businessDate, status: "uploading",
    attempts: num(queued?.attempts) + 1, updated_at: new Date().toISOString(), last_error: null,
  }, { onConflict: "shift_id" });

  try {
  const [ordersRaw, webRaw] = await Promise.all([
    fetchRows(client, "orders", (query) => query.eq("store_id", shift.store_id).gte("created_at", openedAt).lte("created_at", closedAt)),
    fetchRows(client, "web_orders", (query) => query.eq("store_id", shift.store_id).gte("created_at", openedAt).lte("created_at", closedAt)),
  ]);
  const orders = ordersRaw.filter((row) => TERMINAL.has(orderStatus(row)));
  const convertedWebIds = new Set(orders.map((row) => String(row.source_web_order_id || "")).filter(Boolean));
  const webOrders = webRaw.filter((row) => TERMINAL.has(orderStatus(row)) && !convertedWebIds.has(String(row.id)));
  const archivedOrders = orders.map((row) => archiveOrder(row, "POS", businessDate));
  const archivedWebOrders = webOrders.map((row) => archiveOrder(row, "WEB", businessDate));
  const parentById = new Map([...archivedOrders, ...archivedWebOrders].map((row) => [row.source_id, row]));
  let orderItems = [];
  if (orders.length) {
    const { data, error } = await client.from("order_items").select("*").in("order_id", orders.map((row) => row.id));
    if (error) throw new Error(`order_items: ${error.message}`);
    orderItems = (data || []).map((item) => archiveItem(item, parentById.get(String(item.order_id))));
  }
  webOrders.forEach((order) => webItems(order).forEach((item, index) => orderItems.push(archiveWebItem(item, order, index, businessDate))));
  const archivedShift = [{ source_id: String(shift.id), business_date: businessDate, store_id: shift.store_id || null,
    cashier_id: shift.cashier_id || null, mode: shift.mode, created_at: shift.created_at,
    cash_total: num(shift.cash_total), payload_json: JSON.stringify(shift) }];
  const datasets = [
    { table: "archive_orders", manifestTable: "archive_orders", rows: archivedOrders },
    { table: "archive_orders", manifestTable: "archive_web_orders", rows: archivedWebOrders },
    { table: "archive_order_items", manifestTable: "archive_order_items", rows: orderItems },
    { table: "archive_shifts", manifestTable: "archive_shifts", rows: archivedShift },
  ];
  const counts = Object.fromEntries(datasets.map(({ manifestTable, rows }) => [manifestTable, rows.length]));
  const allOrders = [...archivedOrders, ...archivedWebOrders];
  const totals = allOrders.reduce((sum, row) => ({ gross: sum.gross + row.gross_amount,
    discounts: sum.discounts + row.discount_amount, refunds: sum.refunds + row.refund_amount, net: sum.net + row.net_amount }),
  { gross: 0, discounts: 0, refunds: 0, net: 0 });
  Object.keys(totals).forEach((key) => { totals[key] = Number(totals[key].toFixed(2)); });
  const records = datasets.flatMap(({ manifestTable, rows }) => rows.map((row) => ({
    table: manifestTable, sourceId: String(row.source_id), rowHash: hash(row),
  }))).sort((a, b) => `${a.table}:${a.sourceId}`.localeCompare(`${b.table}:${b.sourceId}`));
  const manifestChecksum = createHash("sha256").update(records.map((row) => `${row.table}:${row.sourceId}:${row.rowHash}`).join("\n")).digest("hex");

  await archiveRequest("/v1/archive/shift/start", { shiftId: String(shiftId), storeId: shift.store_id,
    cashierId: shift.cashier_id, openedAt, closedAt, businessDate, expectedCounts: counts,
    expectedTotals: totals, expectedChecksum: manifestChecksum });
  for (const dataset of datasets) {
    if (!dataset.rows.length) continue;
    await archiveRequest("/v1/archive/batch", { shiftId: String(shiftId), table: dataset.table,
      manifestTable: dataset.manifestTable, rows: dataset.rows, hashes: dataset.rows.map(hash) });
  }
  const result = await archiveRequest("/v1/archive/shift/finalize", { shiftId: String(shiftId) });
  const { data: batch } = await client.from("sales_archive_batches").select("id").eq("shift_id", String(shiftId)).maybeSingle();
  if (batch?.id && records.length) await client.from("sales_archive_batch_records").upsert(records.map((row) => ({
    batch_id: batch.id, source_table: row.table, source_id: row.sourceId, record_hash: row.rowHash,
  })), { onConflict: "batch_id,source_table,source_id" });
  await client.from("sales_archive_batches").update({ status: "verified", expected_counts: counts,
    expected_totals: totals, expected_checksum: manifestChecksum, d1_counts: result.counts,
    d1_totals: result.totals, d1_checksum: result.checksum, verified_at: new Date().toISOString(),
    purge_after: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), updated_at: new Date().toISOString() })
    .eq("shift_id", String(shiftId));
  return { shiftId: String(shiftId), businessDate, counts, totals, checksum: manifestChecksum, verified: true };
  } catch (error) {
    const status = error?.payload?.status === "mismatch" || error?.payload?.countsMatch === false ||
      error?.payload?.totalsMatch === false || error?.payload?.checksumMatch === false ? "mismatch" : "failed";
    await client.from("sales_archive_batches").update({
      status,
      last_error: String(error?.message || "D1 shift archive failed.").slice(0, 2000),
      updated_at: new Date().toISOString(),
    }).eq("shift_id", String(shiftId));
    throw error;
  }
}

export async function retryQueuedShiftArchives(limit = 10) {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.from("sales_archive_batches")
    .select("shift_id,status,attempts")
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(50, Number(limit) || 10)));
  if (error) throw error;

  const results = [];
  for (const batch of data || []) {
    try {
      results.push({ ok: true, ...(await archiveClosedShift(batch.shift_id)) });
    } catch (archiveError) {
      results.push({ ok: false, shiftId: batch.shift_id, error: archiveError?.message || "Archive failed." });
    }
  }
  return results;
}
