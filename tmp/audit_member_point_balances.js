/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const envPath = path.join(process.cwd(), ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const START_ISO = new Date("2026-06-29T00:00:00+08:00").toISOString();
const JULY_1_START = new Date("2026-07-01T00:00:00+08:00");
const JULY_2_START = new Date("2026-07-02T00:00:00+08:00");
const AUG_1_START = new Date("2026-08-01T00:00:00+08:00");
const AUG_2_START = new Date("2026-08-02T00:00:00+08:00");
const ACTIVE = new Set(["paid", "closed", "completed", "complete", "delivered", "ready"]);

const num = (value) => Number(value || 0) || 0;
const round2 = (value) => Number(num(value).toFixed(2));
const text = (value) => String(value || "").trim().toLowerCase();

async function fetchAll(builder) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await builder().range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

function inRange(value, start, end) {
  const date = new Date(value || 0);
  return date >= start && date < end;
}

async function main() {
  const [orders, webOrders, members] = await Promise.all([
    fetchAll(() => supabase.from("orders")
      .select("id,receipt_number,source_web_order_id,created_at,paid_at,status,customer_name,customer_id,loyalty_member_id,user_id,total,net_amount,loyalty_points_awarded,loyalty_points_awarded_at")
      .gte("created_at", START_ISO).order("created_at")),
    fetchAll(() => supabase.from("web_orders").select("*")
      .gte("created_at", START_ISO).order("created_at")),
    fetchAll(() => supabase.from("loyalty_members")
      .select('id,user_id,customer_name,customer_code,"Points balance","Available points","Total spent","Total visits"')),
  ]);

  const byId = new Map(members.map((row) => [String(row.id), row]));
  const byUser = new Map(members.filter((row) => row.user_id).map((row) => [String(row.user_id), row]));
  const byName = new Map();
  for (const row of members) {
    const key = text(row.customer_name);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(row);
  }
  const resolve = (row) => {
    const explicit = row.loyalty_member_id || row.customer_id;
    if (explicit && byId.has(String(explicit))) return byId.get(String(explicit));
    if (row.user_id && byUser.has(String(row.user_id))) return byUser.get(String(row.user_id));
    const matches = byName.get(text(row.customer_name)) || [];
    return matches.length === 1 ? matches[0] : null;
  };

  const linkedWebIds = new Set(orders.map((row) => row.source_web_order_id).filter(Boolean).map(String));
  const linkedReceipts = new Set(orders.map((row) => text(row.receipt_number)).filter(Boolean));
  const rows = [];
  for (const order of orders) {
    if (!ACTIVE.has(text(order.status))) continue;
    const member = resolve(order);
    if (!member) continue;
    rows.push({
      source: "orders", id: order.id, receipt: order.receipt_number,
      date: order.paid_at || order.created_at, memberId: String(member.id),
      memberName: member.customer_name, total: round2(order.net_amount ?? order.total),
      awarded: round2(order.loyalty_points_awarded), awardedAt: order.loyalty_points_awarded_at,
    });
  }
  for (const order of webOrders) {
    if (linkedWebIds.has(String(order.id)) || linkedReceipts.has(text(order.receipt_number))) continue;
    if (!ACTIVE.has(text(order.status || order.order_status))) continue;
    const member = resolve(order);
    if (!member) continue;
    rows.push({
      source: "web_orders", id: order.id, receipt: order.receipt_number,
      date: order.completed_at || order.created_at, memberId: String(member.id),
      memberName: member.customer_name, total: round2(order.total || order.subtotal),
      awarded: round2(order.loyalty_points_awarded), awardedAt: order.loyalty_points_awarded_at,
    });
  }

  const grouped = new Map();
  for (const row of rows) {
    const value = grouped.get(row.memberId) || { awarded: 0, transactions: 0 };
    value.awarded = round2(value.awarded + row.awarded);
    value.transactions += 1;
    grouped.set(row.memberId, value);
  }

  const balanceDeficits = [];
  for (const [memberId, summary] of grouped) {
    const member = byId.get(memberId);
    const balance = round2(member?.["Points balance"]);
    if (balance + 0.009 < summary.awarded) {
      balanceDeficits.push({
        memberId, customer: member.customer_name, code: member.customer_code,
        currentPointsBalance: balance, awardedSinceJune29: summary.awarded,
        minimumMissing: round2(summary.awarded - balance), transactions: summary.transactions,
      });
    }
  }

  const dateRows = {
    july1: rows.filter((row) => inRange(row.date, JULY_1_START, JULY_2_START)),
    august1: rows.filter((row) => inRange(row.date, AUG_1_START, AUG_2_START)),
  };
  const report = {
    generatedAt: new Date().toISOString(),
    counts: { audited: rows.length, balanceDeficits: balanceDeficits.length, july1: dateRows.july1.length, august1: dateRows.august1.length },
    balanceDeficits,
    july1: dateRows.july1,
    august1: dateRows.august1,
  };
  const output = path.join(process.cwd(), "tmp", "member_point_balance_audit.json");
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, ...report }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
