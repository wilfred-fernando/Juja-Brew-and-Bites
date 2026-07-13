/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

function round2(value) {
  return Number((Number(value || 0)).toFixed(2));
}

async function main() {
  loadEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const auditPath = path.join(process.cwd(), "tmp", "loyalty_audit_june29_result.json");
  const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
  const rows = (audit.missingOrWrongAwards || [])
    .filter((row) => row.source === "orders")
    .filter((row) => round2(row.expectedPoints - row.storedAwarded) > 0)
    .filter((row) => row.orderId && row.memberId);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const updated = [];
  const skipped = [];
  const failed = [];

  for (const row of rows) {
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id,receipt_number,loyalty_points_awarded,loyalty_points_awarded_at,loyalty_member_id,customer_id,total,net_amount")
      .eq("id", row.orderId)
      .maybeSingle();

    if (orderErr || !order?.id) {
      failed.push({ receipt: row.receipt, error: orderErr?.message || "Order not found." });
      continue;
    }

    const alreadyAwarded = round2(order.loyalty_points_awarded) > 0 || Boolean(order.loyalty_points_awarded_at);
    if (alreadyAwarded) {
      skipped.push({
        receipt: row.receipt,
        reason: "Order already has loyalty award marker.",
        currentAwarded: round2(order.loyalty_points_awarded),
      });
      continue;
    }

    const { data: member, error: awardErr } = await supabase.rpc("award_loyalty_points_for_order", {
      p_order_id: row.orderId,
      p_member_id: row.memberId,
      p_points: round2(row.expectedPoints),
      p_sale_total: round2(row.total),
    });

    if (awardErr || !member?.id) {
      failed.push({ receipt: row.receipt, error: awardErr?.message || "Loyalty RPC did not return a member." });
      continue;
    }

    const { error: voucherErr } = await supabase.rpc("ensure_vouchers_for_member", { p_member_id: row.memberId });
    updated.push({
      receipt: row.receipt,
      customer: row.memberName,
      pointsAdded: round2(row.expectedPoints),
      memberId: row.memberId,
      availablePointsAfter: round2(member["Available points"]),
      pointsBalanceAfter: round2(member["Points balance"]),
      voucherWarning: voucherErr?.message || null,
    });
  }

  console.log(JSON.stringify({
    attempted: rows.length,
    updated,
    skipped,
    failed,
  }, null, 2));

  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
