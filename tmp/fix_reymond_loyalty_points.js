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

const MEMBER_CODE = "JUJA2026001064";
const POINT_RATE = 0.04;
const SALE_STATUSES = new Set(["paid", "closed", "completed", "complete", "delivered", "ready"]);
const REFUND_STATUSES = new Set(["refunded", "voided", "cancelled", "canceled"]);

function num(value) {
  return Number(value || 0) || 0;
}

function round2(value) {
  return Number(num(value).toFixed(2));
}

function statusSale(status) {
  return SALE_STATUSES.has(String(status || "").toLowerCase());
}

function statusRefund(status) {
  return REFUND_STATUSES.has(String(status || "").toLowerCase());
}

function receiptOf(row) {
  return String(row.receipt_number || row.order_number || row.id || "").trim();
}

function dateOf(row) {
  return row.paid_at || row.completed_at || row.created_at;
}

async function main() {
  const { data: member, error: memberError } = await supabase
    .from("loyalty_members")
    .select("*")
    .eq("customer_code", MEMBER_CODE)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member?.id) throw new Error(`Member not found: ${MEMBER_CODE}`);

  const { data: posRows, error: posError } = await supabase
    .from("orders")
    .select("*")
    .or(`loyalty_member_id.eq.${member.id},customer_id.eq.${member.id},customer_name.ilike.%${member.customer_name || member.name || ""}%`)
    .order("created_at", { ascending: true });
  if (posError) throw posError;

  const { data: webRows, error: webError } = await supabase
    .from("web_orders")
    .select("*")
    .or(`user_id.eq.${member.user_id},customer_name.ilike.%${member.customer_name || member.name || ""}%,customer_contact.ilike.%${member.Phone || member.phone || ""}%`)
    .order("created_at", { ascending: true });
  if (webError) throw webError;

  const posByReceipt = new Map((posRows || []).filter((row) => receiptOf(row)).map((row) => [receiptOf(row), row]));
  const saleByReceipt = new Map();

  for (const row of webRows || []) {
    const receipt = receiptOf(row);
    if (!receipt || statusRefund(row.status)) continue;
    if (!statusSale(row.status)) continue;
    saleByReceipt.set(receipt, { ...row, source: "web" });
  }

  for (const row of posRows || []) {
    const receipt = receiptOf(row);
    if (!receipt || statusRefund(row.status)) continue;
    if (!statusSale(row.status)) continue;
    saleByReceipt.set(receipt, { ...row, source: "pos" });
  }

  const saleRows = Array.from(saleByReceipt.values()).sort((a, b) => new Date(dateOf(a)) - new Date(dateOf(b)));
  const targetSpent = round2(saleRows.reduce((sum, row) => sum + num(row.net_amount ?? row.total), 0));
  const targetPoints = round2(targetSpent * POINT_RATE);
  const targetVisits = saleRows.length;

  const creditedWebOrders = [];
  for (const web of webRows || []) {
    const receipt = receiptOf(web);
    if (!receipt || !statusSale(web.status) || statusRefund(web.status)) continue;
    if (posByReceipt.has(receipt)) continue;
    if (num(web.loyalty_points_awarded) > 0 || web.loyalty_points_awarded_at) continue;
    const points = round2(num(web.total) * POINT_RATE);
    const { error } = await supabase.rpc("award_loyalty_points_for_web_order", {
      p_web_order_id: web.id,
      p_member_id: member.id,
      p_points: points,
      p_sale_total: round2(web.total),
    });
    if (error) throw error;
    creditedWebOrders.push({ receipt, points });
  }

  const { data: afterWeb, error: afterWebError } = await supabase
    .from("loyalty_members")
    .select("*")
    .eq("id", member.id)
    .maybeSingle();
  if (afterWebError) throw afterWebError;

  const currentPoints = round2(afterWeb["Points balance"]);
  const currentAvailable = round2(afterWeb["Available points"]);
  const pointsDelta = Math.max(0, round2(targetPoints - currentPoints));
  const firstVisit = saleRows[0] ? dateOf(saleRows[0]) : afterWeb["First visit"];
  const lastVisit = saleRows[saleRows.length - 1] ? dateOf(saleRows[saleRows.length - 1]) : afterWeb["Last visit"];

  const { data: updated, error: updateError } = await supabase
    .from("loyalty_members")
    .update({
      "Points balance": round2(Math.max(currentPoints, targetPoints)),
      "Available points": round2(currentAvailable + pointsDelta),
      "Total spent": round2(Math.max(num(afterWeb["Total spent"]), targetSpent)),
      "Total visits": targetVisits,
      "First visit": firstVisit,
      "Last visit": lastVisit,
    })
    .eq("id", member.id)
    .select("*")
    .maybeSingle();
  if (updateError) throw updateError;

  console.log(JSON.stringify({
    member: MEMBER_CODE,
    creditedWebOrders,
    uniqueSaleReceipts: saleRows.map((row) => ({ receipt: receiptOf(row), source: row.source, total: num(row.net_amount ?? row.total), date: dateOf(row) })),
    targetSpent,
    targetPoints,
    targetVisits,
    pointsDelta,
    updated: {
      points_balance: updated["Points balance"],
      available_points: updated["Available points"],
      total_spent: updated["Total spent"],
      visits: updated["Total visits"],
      first_visit: updated["First visit"],
      last_visit: updated["Last visit"],
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
