/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const repairColumns = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'loyalty_point_balance_repairs'
    order by ordinal_position
  `);
  const repairs = await client.query(`
    select *
    from public.loyalty_point_balance_repairs
    order by created_at desc
  `);
  const eventColumns = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'loyalty_point_award_events'
    order by ordinal_position
  `);
  const events = await client.query(`
    select e.*
    from public.loyalty_point_award_events e
    where e.metadata ? 'backfilled'
       or e.points_balance_after is null
       or e.available_points_after is null
    order by e.id desc
  `);
  const result = { repairs: repairs.rows, nonAuthoritativeEvents: events.rows };
  fs.writeFileSync(path.join(process.cwd(), "tmp", "july30_31_authoritative_events.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    repairColumns: repairColumns.rows.map((row) => row.column_name),
    eventColumns: eventColumns.rows.map((row) => row.column_name),
    repairCount: repairs.rowCount,
    nonAuthoritativeEventCount: events.rowCount,
    repairs: repairs.rows.map((row) => ({
      availableDelta: row.available_points_delta,
      reason: row.reason,
      createdAt: row.created_at,
    })),
  }, null, 2));
  await client.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
