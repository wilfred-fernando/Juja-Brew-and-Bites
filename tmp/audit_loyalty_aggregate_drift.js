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
const START_ISO = new Date("2026-06-29T00:00:00+08:00").toISOString();
const ACTIVE = new Set(["paid", "closed", "completed", "complete", "delivered", "ready"]);
const num = (value) => Number(value || 0) || 0;
const round2 = (value) => Number(num(value).toFixed(2));
const lower = (value) => String(value || "").trim().toLowerCase();

async function fetchAll(builder) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await builder().range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

async function main() {
  const [orders, webOrders, members] = await Promise.all([
    fetchAll(() => supabase.from("orders")
      .select("id,receipt_number,source_web_order_id,created_at,paid_at,status,customer_name,customer_id,loyalty_member_id,user_id,total,net_amount,loyalty_points_awarded,loyalty_points_awarded_at")
      .gte("created_at", START_ISO).order("created_at")),
    fetchAll(() => supabase.from("web_orders").select("*").gte("created_at", START_ISO).order("created_at")),
    fetchAll(() => supabase.from("loyalty_members")
      .select('id,user_id,customer_name,customer_code,"Points balance","Available points","Total spent","Total visits"')),
  ]);

  const byId = new Map(members.map((row) => [String(row.id), row]));
  const byUser = new Map(members.filter((row) => row.user_id).map((row) => [String(row.user_id), row]));
  const byName = new Map();
  for (const member of members) {
    const key = lower(member.customer_name);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(member);
  }
  const resolveMember = (row) => {
    const explicit = row.loyalty_member_id || row.customer_id;
    if (explicit && byId.has(String(explicit))) return byId.get(String(explicit));
    if (row.user_id && byUser.has(String(row.user_id))) return byUser.get(String(row.user_id));
    const matches = byName.get(lower(row.customer_name)) || [];
    return matches.length === 1 ? matches[0] : null;
  };

  const linkedWebIds = new Set(orders.map((row) => row.source_web_order_id).filter(Boolean).map(String));
  const linkedReceipts = new Set(orders.map((row) => lower(row.receipt_number)).filter(Boolean));
  const transactions = [];
  for (const order of orders) {
    if (!ACTIVE.has(lower(order.status)) || num(order.loyalty_points_awarded) <= 0) continue;
    const member = resolveMember(order);
    if (!member) continue;
    transactions.push({
      source: "orders", id: order.id, receipt: order.receipt_number,
      date: order.paid_at || order.created_at, memberId: String(member.id),
      points: round2(order.loyalty_points_awarded), saleTotal: round2(order.net_amount ?? order.total),
    });
  }
  for (const order of webOrders) {
    if (linkedWebIds.has(String(order.id)) || linkedReceipts.has(lower(order.receipt_number))) continue;
    if (!ACTIVE.has(lower(order.status || order.order_status)) || num(order.loyalty_points_awarded) <= 0) continue;
    const member = resolveMember(order);
    if (!member) continue;
    transactions.push({
      source: "web_orders", id: order.id, receipt: order.receipt_number,
      date: order.completed_at || order.created_at, memberId: String(member.id),
      points: round2(order.loyalty_points_awarded),
      saleTotal: round2(order.loyalty_sale_total ?? order.total ?? order.subtotal),
    });
  }

  const grouped = new Map();
  for (const tx of transactions) {
    const summary = grouped.get(tx.memberId) || { points: 0, spent: 0, visits: 0, transactions: [] };
    summary.points = round2(summary.points + tx.points);
    summary.spent = round2(summary.spent + tx.saleTotal);
    summary.visits += 1;
    summary.transactions.push(tx);
    grouped.set(tx.memberId, summary);
  }

  const affected = [];
  for (const [memberId, summary] of grouped) {
    const member = byId.get(memberId);
    const current = {
      points: round2(member?.["Points balance"]),
      available: round2(member?.["Available points"]),
      spent: round2(member?.["Total spent"]),
      visits: Math.trunc(num(member?.["Total visits"])),
    };
    if (current.points + 0.009 >= summary.points && current.spent + 0.009 >= summary.spent && current.visits >= summary.visits) continue;
    affected.push({
      memberId,
      customer: member.customer_name,
      code: member.customer_code,
      current,
      minimumSinceJune29: { points: summary.points, spent: summary.spent, visits: summary.visits },
      deficits: {
        points: round2(Math.max(0, summary.points - current.points)),
        spent: round2(Math.max(0, summary.spent - current.spent)),
        visits: Math.max(0, summary.visits - current.visits),
      },
      transactions: summary.transactions,
    });
  }
  const report = { generatedAt: new Date().toISOString(), transactionCount: transactions.length, affected };
  const output = path.join(process.cwd(), "tmp", "loyalty_aggregate_drift_audit.json");
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, affectedCount: affected.length, affected }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
