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

const TARGETS = ["James Rudolf Javier", "Rossenie Dela Torre"];
const lower = (value) => String(value || "").trim().toLowerCase();
const num = (value) => Number(value || 0) || 0;
const round2 = (value) => Number(num(value).toFixed(2));

async function fetchAll(builder) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await builder().range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

async function optionalRows(table, memberId) {
  const attempts = [
    () => supabase.from(table).select("*").eq("loyalty_member_id", memberId),
    () => supabase.from(table).select("*").eq("member_id", memberId),
    () => supabase.from(table).select("*").eq("customer_id", memberId),
  ];
  for (const attempt of attempts) {
    const { data, error } = await attempt();
    if (!error) return data || [];
    if (!/column .* does not exist|schema cache|Could not find the table/i.test(error.message || "")) throw error;
  }
  return [];
}

async function main() {
  const members = await fetchAll(() => supabase.from("loyalty_members").select("*"));
  const targetTokens = TARGETS.map((target) => lower(target).split(/\s+/).filter((token) => token.length >= 4));
  const matches = members.filter((member) => {
    const name = lower(member.customer_name || member.full_name || member.name);
    return targetTokens.some((tokens) => tokens.filter((token) => name.includes(token)).length >= 2);
  });
  const reports = [];

  for (const member of matches) {
    const memberId = String(member.id);
    const userId = member.user_id ? String(member.user_id) : "";
    const [orders, webOrders, vouchers, pointTransactions] = await Promise.all([
      fetchAll(() => supabase.from("orders").select("*").or(`customer_id.eq.${memberId},loyalty_member_id.eq.${memberId}${userId ? `,user_id.eq.${userId}` : ""}`).order("created_at", { ascending: true })),
      fetchAll(() => supabase.from("web_orders").select("*").or(`loyalty_member_id.eq.${memberId}${userId ? `,user_id.eq.${userId}` : ""}`).order("created_at", { ascending: true })),
      optionalRows("vouchers", memberId),
      optionalRows("loyalty_point_transactions", memberId),
    ]);

    const posByWebId = new Map(orders.filter((row) => row.source_web_order_id).map((row) => [String(row.source_web_order_id), row]));
    const posReceipts = new Set(orders.map((row) => lower(row.receipt_number)).filter(Boolean));
    const receipts = orders.map((row) => ({
      source: "POS",
      id: row.id,
      receipt: row.receipt_number,
      date: row.paid_at || row.completed_at || row.created_at,
      status: row.status,
      total: round2(row.net_amount ?? row.total),
      pointsPrintedOrMarked: round2(row.loyalty_points_awarded ?? row.points_earned),
      pointsAwardedAt: row.loyalty_points_awarded_at || null,
      sourceWebOrderId: row.source_web_order_id || null,
    }));
    for (const row of webOrders) {
      if (posByWebId.has(String(row.id)) || posReceipts.has(lower(row.receipt_number))) continue;
      receipts.push({
        source: "WEB",
        id: row.id,
        receipt: row.receipt_number,
        date: row.completed_at || row.delivered_at || row.created_at,
        status: row.status || row.order_status,
        total: round2(row.loyalty_sale_total ?? row.total ?? row.subtotal),
        pointsPrintedOrMarked: round2(row.loyalty_points_awarded ?? row.points_earned),
        pointsAwardedAt: row.loyalty_points_awarded_at || null,
      });
    }
    receipts.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

    reports.push({
      member: {
        id: member.id,
        userId: member.user_id,
        name: member.customer_name,
        code: member.customer_code,
        pointsBalance: round2(member["Points balance"]),
        availablePoints: round2(member["Available points"]),
        totalSpent: round2(member["Total spent"]),
        visits: num(member["Total visits"]),
        firstVisit: member["First visit"],
        lastVisit: member["Last visit"],
      },
      receiptMarkedPointTotal: round2(receipts.reduce((sum, row) => sum + row.pointsPrintedOrMarked, 0)),
      receipts,
      vouchers: vouchers.map((row) => ({
        id: row.id,
        code: row.code || row.voucher_code,
        type: row.type || row.voucher_type,
        status: row.status,
        pointsCost: row.points_cost ?? row.points_required ?? row.points,
        createdAt: row.created_at || row.issued_at,
        redeemedAt: row.redeemed_at,
      })),
      pointTransactions,
    });
  }

  const output = path.join(process.cwd(), "tmp", "named_loyalty_progression_audit.json");
  fs.writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2));
  console.log(JSON.stringify({ output, reports }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
