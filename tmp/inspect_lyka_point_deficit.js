/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const MEMBER_ID = "35143813-5fb4-4c2b-9a42-fc2c346476b4";

async function main() {
  const [memberResult, ordersResult, webResult, voucherResult] = await Promise.all([
    supabase.from("loyalty_members").select('*').eq("id", MEMBER_ID).single(),
    supabase.from("orders").select("id,receipt_number,created_at,paid_at,status,total,net_amount,refund_amount,loyalty_points_awarded,loyalty_points_awarded_at,customer_id,loyalty_member_id,source_metadata,items").or(`customer_id.eq.${MEMBER_ID},loyalty_member_id.eq.${MEMBER_ID}`).order("created_at"),
    supabase.from("web_orders").select("*").or(`customer_id.eq.${MEMBER_ID},loyalty_member_id.eq.${MEMBER_ID}`).order("created_at"),
    supabase.from("vouchers").select("*").eq("loyalty_member_id", MEMBER_ID).order("created_at"),
  ]);
  for (const result of [memberResult, ordersResult, webResult, voucherResult]) if (result.error) console.error(result.error);
  console.log(JSON.stringify({ member: memberResult.data, orders: ordersResult.data, webOrders: webResult.data, vouchers: voucherResult.data }, null, 2));
}
main().catch((error) => { console.error(error); process.exit(1); });
