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

function collectBalanceScalars(value, pathParts = [], result = {}) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectBalanceScalars(entry, [...pathParts, String(index)], result));
    return result;
  }
  if (!value || typeof value !== "object") return result;

  for (const [key, nested] of Object.entries(value)) {
    const nextPath = [...pathParts, key];
    if (/point|balance|available|loyalty/i.test(key) && (nested == null || typeof nested !== "object")) {
      result[nextPath.join(".")] = nested;
    }
    if (nested && typeof nested === "object") collectBalanceScalars(nested, nextPath, result);
  }
  return result;
}

async function main() {
  const { data, error } = await supabase
    .from("orders")
    .select("id,receipt_number,customer_name,paid_at,loyalty_member_id,loyalty_points_awarded,source_metadata,items")
    .gte("paid_at", "2026-07-30T00:00:00+08:00")
    .lt("paid_at", "2026-08-01T00:00:00+08:00")
    .not("loyalty_member_id", "is", null)
    .order("paid_at");
  if (error) throw error;

  const output = (data || []).map((order) => ({
    receipt: order.receipt_number,
    customer: order.customer_name,
    paidAt: order.paid_at,
    awarded: order.loyalty_points_awarded,
    metadata: collectBalanceScalars(order.source_metadata),
    itemFields: collectBalanceScalars(order.items),
  }));
  const outputPath = path.join(process.cwd(), "tmp", "july30_31_balance_metadata.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  const withSnapshots = output.filter(
    (row) => Object.keys(row.metadata).length || Object.keys(row.itemFields).length,
  );
  console.log(JSON.stringify({
    outputPath,
    orders: output.length,
    ordersWithBalanceFields: withSnapshots.length,
    snapshots: withSnapshots,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
