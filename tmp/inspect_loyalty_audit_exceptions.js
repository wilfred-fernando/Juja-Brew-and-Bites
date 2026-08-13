/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const memberIds = [
  "0cd48d62-abf0-462f-9ed6-25c5517f4adf", // Clifford Bendoy
  "5f51fe15-7610-4aeb-b867-de056f70902b", // Samuel Santos
  "5b46f4a9-7d88-4f22-96de-6d2453b696ff", // placeholder resolved by customer code below
];

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const report = {};
    report.members = (await db.query(`
      select id, customer_name, customer_code,
             round(coalesce(nullif("Points balance"::text,'')::numeric,0),2) points_balance,
             round(coalesce(nullif("Available points"::text,'')::numeric,0),2) available_points,
             round(coalesce(nullif("Total spent"::text,'')::numeric,0),2) total_spent,
             coalesce(nullif("Total visits"::text,''),'0')::numeric total_visits
      from public.loyalty_members
      where id = any($1::uuid[]) or customer_code in ('JUJA2025000085','JUJA2025000416','JUJA2026000885')
      order by customer_name
    `, [memberIds])).rows;

    const ids = report.members.map((row) => row.id);
    report.orders = (await db.query(`
      select o.id, o.loyalty_member_id, o.receipt_number, o.status,
             round(coalesce(nullif(o.total::text,'')::numeric,0),2) total,
             round(coalesce(nullif(o.loyalty_points_awarded::text,'')::numeric,0),2) stored_points,
             o.created_at, o.paid_at, o.updated_at,
             e.points_awarded event_points,
             e.points_balance_after, e.available_points_after
      from public.orders o
      left join public.loyalty_point_award_events e
        on e.source_type='order' and e.source_id=o.id
      where o.loyalty_member_id = any($1::uuid[])
        and coalesce(o.paid_at,o.created_at) >= '2026-07-01 00:00:00+08'
      order by o.loyalty_member_id, coalesce(o.paid_at,o.created_at), o.id
    `, [ids])).rows;

    report.web_orders = (await db.query(`
      select w.id, w.loyalty_member_id, w.receipt_number, w.status,
             round(coalesce(nullif(w.total::text,'')::numeric,0),2) total,
             round(coalesce(nullif(w.loyalty_points_awarded::text,'')::numeric,0),2) stored_points,
             w.created_at, w.updated_at,
             e.points_awarded event_points,
             e.points_balance_after, e.available_points_after
      from public.web_orders w
      left join public.loyalty_point_award_events e
        on e.source_type='web_order' and e.source_id=w.id
      where w.loyalty_member_id = any($1::uuid[])
        and w.created_at >= '2026-07-01 00:00:00+08'
      order by w.loyalty_member_id, w.created_at, w.id
    `, [ids])).rows;

    report.vouchers = (await db.query(`
      select member_id, code, status, points_consumed,
             issued_at, redeemed_at, expires_at, created_at
      from public.vouchers
      where member_id = any($1::uuid[])
        and created_at >= '2026-07-01 00:00:00+08'
      order by member_id, created_at
    `, [ids])).rows;

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
