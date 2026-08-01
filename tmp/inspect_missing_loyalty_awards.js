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
const targets = [
  { webOrderId: "071ee6da-2793-4432-8a81-201e7bed1443", receipt: "D9856320" },
  { webOrderId: "94eae4b3-4e21-419d-9ce9-270a337deebc", receipt: "P7392539" },
];

async function main() {
  for (const target of targets) {
    const [webResult, orderResult] = await Promise.all([
      supabase.from("web_orders").select("*").eq("id", target.webOrderId).maybeSingle(),
      supabase.from("orders").select("*").eq("receipt_number", target.receipt),
    ]);
    if (webResult.error) throw webResult.error;
    if (orderResult.error) throw orderResult.error;

    const web = webResult.data;
    const orders = orderResult.data || [];
    console.log(JSON.stringify({
      target,
      web: web && {
        id: web.id,
        user_id: web.user_id,
        customer_id: web.customer_id,
        loyalty_member_id: web.loyalty_member_id,
        status: web.status,
        order_status: web.order_status,
        total: web.total,
        receipt_number: web.receipt_number,
        loyalty_points_awarded: web.loyalty_points_awarded,
        loyalty_awarded_at: web.loyalty_awarded_at,
        completed_at: web.completed_at,
      },
      orders: orders.map((order) => ({
        id: order.id,
        user_id: order.user_id,
        customer_id: order.customer_id,
        loyalty_member_id: order.loyalty_member_id,
        status: order.status,
        total: order.total,
        receipt_number: order.receipt_number,
        loyalty_points_awarded: order.loyalty_points_awarded,
        loyalty_awarded_at: order.loyalty_awarded_at,
        paid_at: order.paid_at,
        created_at: order.created_at,
      })),
    }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
