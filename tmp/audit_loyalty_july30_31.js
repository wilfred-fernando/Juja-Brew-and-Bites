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
const num = (value) => Number(value || 0);
const fixed = (value) => Number(num(value).toFixed(2));
const validStatus = (status) => !["refunded", "voided", "cancelled", "canceled", "rejected"].includes(String(status || "").toLowerCase());

async function selectAll(table, columns, configure) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(columns);
    query = configure(query).range(from, from + pageSize - 1);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

async function main() {
  const orders = await selectAll("orders", "*", (query) => query
    .gte("paid_at", START)
    .lt("paid_at", END)
    .order("paid_at", { ascending: true }));

  const webOrders = await selectAll("web_orders", "*", (query) => query
    .gte("created_at", START)
    .lt("created_at", END)
    .order("created_at", { ascending: true }));

  const memberIds = new Set();
  for (const row of orders) {
    if (row.loyalty_member_id) memberIds.add(row.loyalty_member_id);
    else if (/^[0-9a-f-]{36}$/i.test(String(row.customer_id || ""))) memberIds.add(row.customer_id);
  }
  for (const row of webOrders) if (row.loyalty_member_id) memberIds.add(row.loyalty_member_id);

  const members = [];
  for (const id of memberIds) {
    const { data, error } = await supabase.from("loyalty_members").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (data) members.push(data);
  }
  const byId = new Map(members.map((row) => [row.id, row]));

  const allMemberOrders = [];
  for (const id of memberIds) {
    const rows = await selectAll("orders", "id,receipt_number,paid_at,created_at,status,total,net_amount,refund_amount,loyalty_member_id,customer_id,customer_name,loyalty_points_awarded,loyalty_points_awarded_at,source_web_order_id", (query) => query
      .or(`loyalty_member_id.eq.${id},customer_id.eq.${id}`)
      .order("paid_at", { ascending: true, nullsFirst: false }));
    allMemberOrders.push(...rows);
  }

  let events = [];
  if (memberIds.size) {
    const { data, error } = await supabase
      .from("loyalty_point_award_events")
      .select("*")
      .in("member_id", [...memberIds])
      .order("awarded_at", { ascending: true });
    if (error) throw error;
    events = data || [];
  }

  let repairs = [];
  if (memberIds.size) {
    const { data, error } = await supabase
      .from("loyalty_point_balance_repairs")
      .select("*")
      .in("member_id", [...memberIds])
      .order("created_at", { ascending: true });
    if (error) throw error;
    repairs = data || [];
  }

  let vouchers = [];
  if (memberIds.size) {
    const { data, error } = await supabase
      .from("vouchers")
      .select("*")
      .in("member_id", [...memberIds])
      .order("created_at", { ascending: true });
    if (error && !/column vouchers\.member_id/i.test(error.message)) throw error;
    vouchers = data || [];
  }

  const convertedWebIds = new Set(orders.map((row) => row.source_web_order_id).filter(Boolean));
  const targetOrders = orders.filter((row) => {
    const id = row.loyalty_member_id || (/^[0-9a-f-]{36}$/i.test(String(row.customer_id || "")) ? row.customer_id : null);
    return id && validStatus(row.status) && num(row.loyalty_points_awarded) > 0;
  });
  const targetWeb = webOrders.filter((row) => row.loyalty_member_id && !convertedWebIds.has(row.id) && validStatus(row.status) && num(row.loyalty_points_awarded) > 0);

  const report = [];
  for (const member of members) {
    const periodOrders = targetOrders.filter((row) => (row.loyalty_member_id || row.customer_id) === member.id);
    const periodWeb = targetWeb.filter((row) => row.loyalty_member_id === member.id);
    if (!periodOrders.length && !periodWeb.length) continue;
    const history = allMemberOrders.filter((row) => (row.loyalty_member_id || row.customer_id) === member.id);
    const historyAwardTotal = fixed(history.filter((row) => validStatus(row.status)).reduce((sum, row) => sum + num(row.loyalty_points_awarded), 0));
    const periodAwardTotal = fixed(periodOrders.reduce((sum, row) => sum + num(row.loyalty_points_awarded), 0) + periodWeb.reduce((sum, row) => sum + num(row.loyalty_points_awarded), 0));
    const memberEvents = events.filter((row) => row.member_id === member.id);
    const liveEvents = memberEvents.filter((row) => !row.metadata?.backfilled);
    const backfilledEvents = memberEvents.filter((row) => row.metadata?.backfilled);
    report.push({
      memberId: member.id,
      customerCode: member.customer_code,
      customerName: member.customer_name,
      currentPointsBalance: fixed(member["Points balance"]),
      currentAvailablePoints: fixed(member["Available points"]),
      currentVisits: num(member["Total visits"]),
      currentSpent: fixed(member["Total spent"]),
      periodAwardTotal,
      lifetimeCurrentOrderAwardTotal: historyAwardTotal,
      periodOrders: periodOrders.map((row) => ({
        source: "order",
        id: row.id,
        receipt: row.receipt_number,
        paidAt: row.paid_at,
        status: row.status,
        total: fixed(row.net_amount ?? row.total),
        refundAmount: fixed(row.refund_amount),
        points: fixed(row.loyalty_points_awarded),
        event: memberEvents.find((event) => event.source_type === "order" && event.source_id === row.id) || null,
      })),
      periodWebOrders: periodWeb.map((row) => ({
        source: "web_order",
        id: row.id,
        receipt: row.receipt_number,
        createdAt: row.created_at,
        status: row.status,
        total: fixed(row.total),
        points: fixed(row.loyalty_points_awarded),
        event: memberEvents.find((event) => event.source_type === "web_order" && event.source_id === row.id) || null,
      })),
      eventSummary: { total: memberEvents.length, live: liveEvents.length, backfilled: backfilledEvents.length },
      repairs: repairs.filter((row) => row.member_id === member.id),
      vouchers: vouchers.filter((row) => row.member_id === member.id).map((row) => ({
        id: row.id,
        code: row.code || row.voucher_code,
        type: row.type || row.voucher_type,
        status: row.status,
        createdAt: row.created_at,
        redeemedAt: row.redeemed_at,
      })),
    });
  }

  const output = {
    window: { start: START, endExclusive: END },
    counts: {
      allOrders: orders.length,
      loyaltyOrders: targetOrders.length,
      loyaltyWebOrdersNotConverted: targetWeb.length,
      affectedMembers: report.length,
      expectedPoints: fixed(report.reduce((sum, row) => sum + row.periodAwardTotal, 0)),
    },
    members: report.sort((a, b) => a.customerName.localeCompare(b.customerName)),
  };
  const outputPath = path.join(process.cwd(), "tmp", "loyalty_july30_31_audit.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({
    ...output.counts,
    members: output.members.map((row) => ({
      name: row.customerName,
      code: row.customerCode,
      currentPoints: row.currentPointsBalance,
      currentAvailable: row.currentAvailablePoints,
      periodPoints: row.periodAwardTotal,
      receipts: [...row.periodOrders, ...row.periodWebOrders].map((item) => `${item.receipt}:${item.points}`),
      events: row.eventSummary,
      repairs: row.repairs.map((item) => item.repair_key),
    })),
    outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
