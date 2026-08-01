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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase service credentials.");

const supabase = createClient(url, key, { auth: { persistSession: false } });
const repairs = [
  {
    webOrderId: "071ee6da-2793-4432-8a81-201e7bed1443",
    memberId: "e96130d8-ce98-4228-ac5c-16cccc9feb24",
    points: 11.12,
    saleTotal: 278,
  },
  {
    webOrderId: "94eae4b3-4e21-419d-9ce9-270a337deebc",
    memberId: "0b7c4a5b-4790-48bc-96e9-ee725c37ef5f",
    points: 137.8,
    saleTotal: 3445,
  },
];

async function main() {
  for (const repair of repairs) {
    const { data: before, error: beforeError } = await supabase
      .from("web_orders")
      .select("id, receipt_number, loyalty_points_awarded, loyalty_points_awarded_at")
      .eq("id", repair.webOrderId)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before?.id) throw new Error(`Web order ${repair.webOrderId} was not found.`);

    const alreadyAwarded = Number(before.loyalty_points_awarded || 0) > 0 || Boolean(before.loyalty_points_awarded_at);
    if (!alreadyAwarded) {
      const { error: awardError } = await supabase.rpc("award_loyalty_points_for_web_order", {
        p_web_order_id: repair.webOrderId,
        p_member_id: repair.memberId,
        p_points: repair.points,
        p_sale_total: repair.saleTotal,
      });
      if (awardError) throw awardError;

      const { error: voucherError } = await supabase.rpc("ensure_vouchers_for_member", {
        p_member_id: repair.memberId,
      });
      if (voucherError) throw voucherError;
    }

    const [{ data: order }, { data: member }] = await Promise.all([
      supabase
        .from("web_orders")
        .select("receipt_number, loyalty_points_awarded, loyalty_points_awarded_at, loyalty_member_id")
        .eq("id", repair.webOrderId)
        .single(),
      supabase
        .from("loyalty_members")
        .select('customer_name, customer_code, "Points balance", "Available points", "Total spent", "Total visits"')
        .eq("id", repair.memberId)
        .single(),
    ]);
    console.log(JSON.stringify({ order, member }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
