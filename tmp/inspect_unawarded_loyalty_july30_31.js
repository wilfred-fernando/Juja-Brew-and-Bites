/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const START = "2026-07-30T00:00:00+08:00";
const END = "2026-08-01T00:00:00+08:00";
const excluded = new Set(["refunded", "voided", "cancelled", "canceled", "rejected"]);
const num = (value) => Number(value || 0);
const fixed = (value) => Number(num(value).toFixed(2));

function lineGross(line) {
  return num(line?.unitPrice ?? line?.unit_price ?? line?.price) * num(line?.quantity ?? line?.qty ?? 1);
}

function lineDiscount(line) {
  return Math.max(0, Math.min(lineGross(line), num(line?.discountAmount ?? line?.discount_amount)));
}

function isPromo(line) {
  return ["promo", "promos", "promotion", "promotions"].includes(
    String(line?.category || line?.category_name || line?.categoryName || "").trim().toLowerCase(),
  );
}

function isWelcomeVoucher(line) {
  const voucher = line?.appliedVoucher || line?.applied_voucher;
  const text = [voucher?.code, voucher?.reward_type, voucher?.reward_text].filter(Boolean).join(" ").toLowerCase();
  return text.includes("welcome");
}

function summarizeItem(line) {
  const gross = lineGross(line);
  const net = Math.max(0, gross - lineDiscount(line));
  const eligible = !isPromo(line) && !isWelcomeVoucher(line) ? net : 0;
  return {
    name: line?.name || line?.item_name || "Unnamed",
    category: line?.category || line?.category_name || line?.categoryName || null,
    qty: num(line?.quantity ?? line?.qty ?? 1),
    unitPrice: fixed(line?.unitPrice ?? line?.unit_price ?? line?.price),
    discount: fixed(lineDiscount(line)),
    net: fixed(net),
    eligible: fixed(eligible),
    voucher: line?.appliedVoucher?.code || line?.applied_voucher?.code || null,
  };
}

async function main() {
  const { data: rows, error } = await supabase
    .from("orders")
    .select("id,receipt_number,created_at,paid_at,status,total,net_amount,refund_amount,customer_id,loyalty_member_id,customer_name,source_web_order_id,payment_method,dining_option,items,loyalty_points_awarded,loyalty_points_awarded_at")
    .gte("created_at", START)
    .lt("created_at", END)
    .not("loyalty_member_id", "is", null)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const candidates = (rows || []).filter((row) =>
    !excluded.has(String(row.status || "").toLowerCase())
      && num(row.loyalty_points_awarded) <= 0
      && !row.loyalty_points_awarded_at,
  );

  const memberIds = [...new Set(candidates.map((row) => row.loyalty_member_id).filter(Boolean))];
  const webIds = [...new Set(candidates.map((row) => row.source_web_order_id).filter(Boolean))];
  const { data: members, error: memberError } = memberIds.length
    ? await supabase.from("loyalty_members").select("*").in("id", memberIds)
    : { data: [], error: null };
  if (memberError) throw memberError;
  const { data: webOrders, error: webError } = webIds.length
    ? await supabase.from("web_orders").select("id,receipt_number,status,total,loyalty_member_id,loyalty_points_awarded,loyalty_points_awarded_at").in("id", webIds)
    : { data: [], error: null };
  if (webError) throw webError;

  const membersById = new Map((members || []).map((row) => [row.id, row]));
  const webById = new Map((webOrders || []).map((row) => [row.id, row]));
  const report = candidates.map((row) => {
    const items = (Array.isArray(row.items) ? row.items : []).map(summarizeItem);
    const eligibleTotal = fixed(items.reduce((sum, item) => sum + item.eligible, 0));
    const expectedPoints = fixed(eligibleTotal * 0.04);
    return {
      orderId: row.id,
      receipt: row.receipt_number,
      createdAt: row.created_at,
      paidAt: row.paid_at,
      status: row.status,
      total: fixed(row.net_amount ?? row.total),
      refundAmount: fixed(row.refund_amount),
      customerName: row.customer_name,
      member: membersById.get(row.loyalty_member_id) || null,
      sourceWebOrder: row.source_web_order_id ? webById.get(row.source_web_order_id) || { id: row.source_web_order_id, missing: true } : null,
      eligibleTotal,
      expectedPoints,
      items,
    };
  });

  const outputPath = path.join(process.cwd(), "tmp", "july30_31_unawarded_orders.json");
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    count: report.length,
    expectedPoints: fixed(report.reduce((sum, row) => sum + row.expectedPoints, 0)),
    orders: report.map((row) => ({
      receipt: row.receipt,
      status: row.status,
      total: row.total,
      customer: row.member?.customer_name || row.customerName,
      code: row.member?.customer_code,
      expectedPoints: row.expectedPoints,
      sourceWebPoints: fixed(row.sourceWebOrder?.loyalty_points_awarded),
      sourceWebAwardedAt: row.sourceWebOrder?.loyalty_points_awarded_at || null,
      itemSummary: row.items.map((item) => `${item.name} x${item.qty} eligible=${item.eligible}${item.voucher ? ` voucher=${item.voucher}` : ""}`),
    })),
    outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
