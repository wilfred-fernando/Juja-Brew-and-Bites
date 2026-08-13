/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const cols = await c.query(`select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name in ('loyalty_point_award_events','loyalty_point_balance_repairs','vouchers','orders') order by table_name,ordinal_position`);
    const member = await c.query(`select * from public.loyalty_members where customer_code='JUJA2026000859' or customer_name ilike '%Camille%Chica%'`);
    const id = member.rows[0]?.id;
    const events = id ? await c.query(`select * from public.loyalty_point_award_events where member_id=$1 order by awarded_at`, [id]) : {rows:[]};
    const repairs = id ? await c.query(`select * from public.loyalty_point_balance_repairs where member_id=$1 order by created_at`, [id]) : {rows:[]};
    const vouchers = id ? await c.query(`select * from public.vouchers where member_id=$1 order by created_at`, [id]) : {rows:[]};
    console.log(JSON.stringify({ columns: cols.rows, member: member.rows, events: events.rows, repairs: repairs.rows, vouchers: vouchers.rows }, null, 2));
  } finally { await c.end(); }
})().catch(e => { console.error(e); process.exit(1); });
