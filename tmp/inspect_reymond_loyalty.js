/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, name, rawValue] = match;
    if (!process.env[name]) process.env[name] = rawValue.replace(/^["']|["']$/g, "");
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const CUSTOMER_CODE = "JUJA2026001064";
const POINT_RATE = 0.04;

function num(value) {
  return Number(value || 0) || 0;
}

function round2(value) {
  return Number(num(value).toFixed(2));
}

function statusIsSale(status) {
  return ["paid", "closed", "completed", "complete", "delivered", "ready"].includes(String(status || "").toLowerCase());
}

function statusIsRefund(status) {
  return ["refunded", "voided", "cancelled", "canceled"].includes(String(status || "").toLowerCase());
}

function itemTotal(item) {
  const explicit = item?.net_amount ?? item?.line_total ?? item?.lineTotal ?? item?.total ?? item?.subtotal;
  if (explicit !== undefined && explicit !== null && explicit !== "") return num(explicit);
  return num(item?.price ?? item?.unit_price ?? item?.unitPrice ?? item?.selectedPrice) * num(item?.quantity ?? item?.qty ?? 1);
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function isWelcomeVoucher(voucher) {
  const text = normalizeText([
    voucher?.code,
    voucher?.reward_text,
    voucher?.reward_type,
    voucher?.description,
    voucher?.title,
    voucher?.type,
  ].filter(Boolean).join(" "));
  return text.includes("welcome") || text.includes("b1t1") || text.includes("buy 1 get 1");
}

function eligibleTotal(order, items = []) {
  const sourceItems = Array.isArray(order.items) && order.items.length ? order.items : items;
  if (sourceItems.length) {
    const eligible = sourceItems.reduce((sum, item) => {
      const category = normalizeText(item?.category_name || item?.categoryName || item?.category);
      if (["promo", "promos", "promotion", "promotions"].includes(category)) return sum;
      if (isWelcomeVoucher(item?.appliedVoucher || item?.applied_voucher)) return sum;
      return sum + itemTotal(item);
    }, 0);
    return round2(eligible);
  }
  return round2(order.net_amount ?? order.total);
}

async function main() {
  const { data: members, error: memberError } = await supabase
    .from("loyalty_members")
    .select("*")
    .eq("customer_code", CUSTOMER_CODE);
  if (memberError) throw memberError;
  const member = members?.[0];
  if (!member) throw new Error(`Member not found: ${CUSTOMER_CODE}`);

  const terms = [member.customer_code, member.customer_name, member.name, member.Phone, member.phone]
    .filter(Boolean)
    .map(String);

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("*")
    .or(`loyalty_member_id.eq.${member.id},customer_id.eq.${member.id},customer_name.ilike.%${member.customer_name || member.name || ""}%`)
    .order("created_at", { ascending: true });
  if (ordersError) throw ordersError;

  const { data: webOrders, error: webError } = await supabase
    .from("web_orders")
    .select("*")
    .or(`user_id.eq.${member.user_id || "00000000-0000-0000-0000-000000000000"},customer_name.ilike.%${member.customer_name || member.name || ""}%,customer_contact.ilike.%${member.Phone || member.phone || ""}%`)
    .order("created_at", { ascending: true });
  if (webError) throw webError;

  const orderIds = (orders || []).map((row) => row.id);
  let orderItems = [];
  if (orderIds.length) {
    const { data, error } = await supabase.from("order_items").select("*").in("order_id", orderIds);
    if (error) throw error;
    orderItems = data || [];
  }

  const byOrder = new Map();
  for (const item of orderItems) {
    const list = byOrder.get(item.order_id) || [];
    list.push(item);
    byOrder.set(item.order_id, list);
  }

  const relatedOrders = (orders || []).filter((order) => {
    const haystack = JSON.stringify(order).toLowerCase();
    return terms.some((term) => haystack.includes(term.toLowerCase()));
  });

  const posRows = relatedOrders.map((order) => {
    const items = byOrder.get(order.id) || [];
    const eligible = eligibleTotal(order, items);
    const expected = statusIsSale(order.status) ? round2(eligible * POINT_RATE) : 0;
    return {
      source: "orders",
      id: order.id,
      receipt: order.receipt_number || order.order_number || order.id,
      date: order.paid_at || order.completed_at || order.created_at,
      status: order.status,
      total: order.total,
      customer_name: order.customer_name,
      loyalty_member_id: order.loyalty_member_id,
      loyalty_points_awarded: order.loyalty_points_awarded,
      expected_points: expected,
      items: items.map((item) => ({ name: item.name || item.item_name, quantity: item.quantity, total: itemTotal(item) })),
    };
  });

  const webRows = (webOrders || []).map((order) => ({
    source: "web_orders",
    id: order.id,
    pos_order_id: order.pos_order_id,
    receipt: order.receipt_number || order.order_number || order.id,
    date: order.completed_at || order.created_at,
    status: order.status,
    total: order.total,
    customer_name: order.customer_name,
    customer_contact: order.customer_contact,
    loyalty_member_id: order.loyalty_member_id,
    user_id: order.user_id,
  }));

  const report = {
    member: {
      id: member.id,
      user_id: member.user_id,
      customer_code: member.customer_code,
      customer_name: member.customer_name || member.name,
      phone: member.Phone || member.phone,
      points_balance: member["Points balance"],
      available_points: member["Available points"],
      total_spent: member["Total spent"],
      visits: member["Total visits"],
    },
    posRows,
    webRows,
    summary: {
      posExpectedPoints: round2(posRows.reduce((sum, row) => sum + num(row.expected_points), 0)),
      posAwardedPoints: round2(posRows.reduce((sum, row) => sum + num(row.loyalty_points_awarded), 0)),
      saleRows: posRows.filter((row) => statusIsSale(row.status)).length,
      refundRows: posRows.filter((row) => statusIsRefund(row.status)).length,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
