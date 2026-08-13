/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const receipts = ["P1565683", "P3454542"];
    const orders = await db.query(`
      select o.id, o.receipt_number, o.status, o.loyalty_member_id,
             round(coalesce(nullif(o.total::text,'')::numeric,0),2) total,
             round(coalesce(nullif(o.loyalty_points_awarded::text,'')::numeric,0),2) current_points,
             o.created_at, o.paid_at, o.updated_at,
             lm.customer_name, lm.customer_code,
             e.points_awarded original_event_points, e.points_balance_after, e.available_points_after
      from public.orders o
      left join public.loyalty_members lm on lm.id=o.loyalty_member_id
      left join public.loyalty_point_award_events e on e.source_type='order' and e.source_id=o.id
      where o.receipt_number=any($1::text[])
    `, [receipts]);
    const web = await db.query(`
      select w.id, w.receipt_number, w.status, w.loyalty_member_id,
             round(coalesce(nullif(w.total::text,'')::numeric,0),2) total,
             round(coalesce(nullif(w.loyalty_points_awarded::text,'')::numeric,0),2) current_points,
             w.created_at, w.updated_at,
             lm.customer_name, lm.customer_code,
             e.points_awarded original_event_points, e.points_balance_after, e.available_points_after
      from public.web_orders w
      left join public.loyalty_members lm on lm.id=w.loyalty_member_id
      left join public.loyalty_point_award_events e on e.source_type='web_order' and e.source_id=w.id
      where w.receipt_number=any($1::text[])
    `, [receipts]);
    console.log(JSON.stringify({ orders: orders.rows, web_orders: web.rows }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
