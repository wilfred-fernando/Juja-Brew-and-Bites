/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ids = ["ece03576-d467-4289-9a10-3a1079cf1836", "89230b96-4893-4721-986d-a8de007ae182"];
const pointish = (row) => Object.fromEntries(Object.entries(row || {}).filter(([key]) => /point|loyal|balance|customer|source|meta|refund|voucher/i.test(key)));

async function main() {
  const output = [];
  for (const id of ids) {
    const { data: member, error: memberError } = await supabase.from("loyalty_members").select("*").eq("id", id).single();
    if (memberError) throw memberError;
    const { data: orders, error: orderError } = await supabase.from("orders").select("*").or(`customer_id.eq.${id},loyalty_member_id.eq.${id}`).order("created_at", { ascending: false }).limit(5);
    if (orderError) throw orderError;
    output.push({
      member: pointish(member),
      latestOrders: (orders || []).map((row) => ({
        id: row.id,
        receipt: row.receipt_number,
        date: row.paid_at || row.created_at,
        total: row.net_amount ?? row.total,
        status: row.status,
        pointish: pointish(row),
        allKeys: Object.keys(row).sort(),
      })),
    });
  }
  console.log(JSON.stringify(output, null, 2));
}
main().catch((error) => { console.error(error); process.exit(1); });
