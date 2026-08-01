const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

loadEnv(path.join(process.cwd(), ".env.local"));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase server credentials are missing.");

const supabase = createClient(url, key, { auth: { persistSession: false } });
const receipts = ["D3654289", "P0928027", "P5564251", "P6832664"];

async function main() {
  const { data: orders, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .in("receipt_number", receipts);
  if (orderError) throw orderError;

  const orderIds = (orders || []).map((row) => row.id);
  const { data: items, error: itemError } = orderIds.length
    ? await supabase.from("order_items").select("*").in("order_id", orderIds)
    : { data: [], error: null };
  if (itemError) throw itemError;

  const { data: webOrders, error: webError } = await supabase
    .from("web_orders")
    .select("*")
    .in("receipt_number", receipts);
  if (webError) throw webError;

  console.log(JSON.stringify({ orders, items, webOrders }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
