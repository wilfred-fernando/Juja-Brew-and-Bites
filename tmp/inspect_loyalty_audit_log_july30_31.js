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
  const columns = await client.query(`
    select column_name, data_type
      from information_schema.columns
     where table_schema = 'public' and table_name = 'audit_log'
     order by ordinal_position
  `);
  const rows = await client.query(`
    select *
      from public.audit_log
     where coalesce(created_at, now()) >= timestamptz '2026-07-29 00:00:00+08'
       and coalesce(created_at, now()) < timestamptz '2026-08-02 00:00:00+08'
     order by created_at
     limit 5000
  `);
  const result = { columns: columns.rows, count: rows.rowCount, rows: rows.rows };
  const output = path.join(process.cwd(), "tmp", "loyalty_audit_log_july30_31.json");
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ output, columns: columns.rows, count: rows.rowCount, sample: rows.rows.slice(0, 5) }, null, 2));
  await client.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
