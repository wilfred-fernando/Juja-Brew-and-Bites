/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, name, rawValue] = match;
    if (process.env[name]) continue;
    process.env[name] = rawValue.replace(/^["']|["']$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing Supabase environment variables.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const start = "2026-06-28T00:00:00+08:00";
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id,receipt_number,created_at,paid_at,status,customer_name,customer_id,loyalty_member_id,total,net_amount,payment_method,dining_option,loyalty_points_awarded_at")
    .gte("created_at", start)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw error;

  const memberIds = [...new Set((orders || []).flatMap((row) => [row.customer_id, row.loyalty_member_id]).filter(Boolean))];
  const { data: members, error: memberError } = memberIds.length
    ? await supabase
        .from("loyalty_members")
        .select('id,customer_name,customer_code,"Phone","Available points","Points balance","Total spent","Total visits","First visit","Last visit"')
        .in("id", memberIds)
    : { data: [], error: null };
  if (memberError) throw memberError;

  const memberById = new Map((members || []).map((member) => [String(member.id), member]));
  if (process.argv.includes("--backfill")) {
    const candidates = (orders || [])
      .filter((order) => ["paid", "closed", "completed", "complete", "delivered"].includes(String(order.status || "").toLowerCase()))
      .filter((order) => !order.loyalty_points_awarded_at)
      .filter((order) => order.loyalty_member_id || order.customer_id)
      .filter((order) => {
        const member = memberById.get(String(order.loyalty_member_id || order.customer_id || ""));
        if (!member) return false;
        const orderTime = new Date(order.paid_at || order.created_at || 0).getTime();
        const lastVisitTime = new Date(member["Last visit"] || 0).getTime();
        return !Number.isFinite(lastVisitTime) || Number.isNaN(lastVisitTime) || lastVisitTime + 1000 < orderTime;
      })
      .sort((a, b) => new Date(a.paid_at || a.created_at || 0) - new Date(b.paid_at || b.created_at || 0));

    const updates = [];
    for (const order of candidates) {
      const memberId = order.loyalty_member_id || order.customer_id;
      const member = memberById.get(String(memberId));
      const total = Number(order.total ?? order.net_amount ?? 0);
      const points = Number((total * 0.04).toFixed(2));
      const stamp = order.paid_at || order.created_at || new Date().toISOString();
      const currentBalance = Number(member["Points balance"] || 0);
      const currentAvailable = Number(member["Available points"] || 0);
      const currentVisits = Number(member["Total visits"] || 0);
      const currentSpent = Number(member["Total spent"] || 0);
      const nextMember = {
        "Points balance": Number((currentBalance + points).toFixed(2)),
        "Available points": Number((currentAvailable + points).toFixed(2)),
        "Total visits": currentVisits + 1,
        "Total spent": Number((currentSpent + total).toFixed(2)),
        "First visit": member["First visit"] || stamp,
        "Last visit": stamp,
      };

      const { data: updatedMember, error: updateMemberError } = await supabase
        .from("loyalty_members")
        .update(nextMember)
        .eq("id", memberId)
        .select("*")
        .maybeSingle();
      if (updateMemberError) throw updateMemberError;
      memberById.set(String(memberId), updatedMember);

      const { error: updateOrderError } = await supabase
        .from("orders")
        .update({
          loyalty_points_awarded: points,
          loyalty_points_awarded_at: stamp,
          customer_id: memberId,
          loyalty_member_id: memberId,
          customer_name: updatedMember.customer_name || member.customer_name || order.customer_name || null,
        })
        .eq("id", order.id);
      if (updateOrderError) throw updateOrderError;
      updates.push({ receipt_number: order.receipt_number, member: updatedMember.customer_name, points, total });
    }

    console.log(JSON.stringify({ backfilled: updates }, null, 2));
    return;
  }

  console.log(JSON.stringify({
    orders: (orders || []).map((order) => ({
      receipt_number: order.receipt_number,
      created_at: order.created_at,
      status: order.status,
      customer_name: order.customer_name,
      customer_id: order.customer_id,
      loyalty_member_id: order.loyalty_member_id,
      total: order.total ?? order.net_amount,
      payment_method: order.payment_method,
      dining_option: order.dining_option,
      member: memberById.get(String(order.loyalty_member_id || order.customer_id || "")) || null,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
