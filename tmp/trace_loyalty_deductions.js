/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");

for (const file of [".env.local", ".env.d1-archive"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

const cases = [
  ["6cb188de-0b30-4cf5-baad-9e39ed7af31c", ["P1565683"]],
  ["c35f45f4-a045-4c2b-bd14-0785915d592c", ["P3454542", "P6622761"]],
];

async function main() {
  const results = [];
  for (const [memberId, receipts] of cases) {
    const response = await fetch(
      `${process.env.D1_ARCHIVE_API_URL}/v1/customer-history?memberId=${memberId}`,
      { headers: { Authorization: `Bearer ${process.env.D1_ARCHIVE_API_TOKEN}` } }
    );
    const payload = await response.json();
    const rows = (payload.rows || payload.data || [])
      .filter((row) => receipts.includes(String(row.receipt_number || row.order_number || row.reference || "")))
      .map((row) => ({
        receipt: row.receipt_number || row.order_number || row.reference,
        status: row.status,
        refund_status: row.refund_status,
        refund_amount: row.refund_amount,
        refunded_amount: row.refunded_amount,
        total: row.total ?? row.total_amount ?? row.net_amount,
        net: row.net_amount,
        points: row.loyalty_points_awarded ?? row.points_earned,
        source: row._archive_source_type || row.source_type,
      }));
    results.push({ memberId, http: response.status, rows });
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
