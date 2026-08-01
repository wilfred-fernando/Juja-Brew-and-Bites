/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const memberIds = [
  "ece03576-d467-4289-9a10-3a1079cf1836",
  "89230b96-4893-4721-986d-a8de007ae182",
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const pointColumns = await client.query(`
    select table_name, column_name, data_type
      from information_schema.columns
     where table_schema = 'public'
       and (column_name ~* '(point|balance|receipt|voucher|refund)' or table_name ~* '(point|receipt|voucher|refund)')
     order by table_name, ordinal_position
  `);
  const audits = await client.query(`
    select id, entity, entity_id, action, diff, created_at
      from public.audit_log
     where entity_id = any($1::text[])
        or diff::text ilike any(array['%ece03576-d467-4289-9a10-3a1079cf1836%', '%89230b96-4893-4721-986d-a8de007ae182%'])
     order by created_at desc
  `, [memberIds]);
  const vouchers = await client.query(`
    select *
      from public.vouchers
     where member_id = any($1::uuid[])
     order by coalesce(redeemed_at, issued_at, created_at) desc nulls last
  `, [memberIds]);
  const refunds = await client.query(`
    select r.*
      from public.refunds r
     where r.order_id in (
       select id from public.orders
        where loyalty_member_id = any($1::uuid[])
           or customer_id::text = any($2::text[])
     )
     order by r.created_at desc
  `, [memberIds, memberIds]);

  const result = { pointColumns: pointColumns.rows, audits: audits.rows, vouchers: vouchers.rows, refunds: refunds.rows };
  fs.writeFileSync(path.join(process.cwd(), "tmp", "named_loyalty_evidence.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    pointTables: [...new Set(pointColumns.rows.map((row) => row.table_name))],
    audits: audits.rowCount,
    vouchers: vouchers.rows.map((row) => ({ id: row.id, member: row.member_id, code: row.code, type: row.reward_type, status: row.status, points: row.points_consumed, issued: row.issued_at, redeemed: row.redeemed_at })),
    refunds: refunds.rows.map((row) => ({ id: row.id, order: row.order_id, amount: row.amount, created_at: row.created_at })),
  }, null, 2));
  await client.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
