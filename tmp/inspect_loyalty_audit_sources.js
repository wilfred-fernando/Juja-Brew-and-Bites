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
  const tables = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and (table_name ilike '%loyal%' or table_name ilike '%point%' or table_name ilike '%audit%' or table_name ilike '%history%' or table_name ilike '%ledger%')
    order by table_name
  `);
  const columns = await client.query(`
    select table_name, column_name, data_type
    from information_schema.columns
    where table_schema = 'public'
      and (
        column_name ilike '%point%'
        or column_name ilike '%balance%'
        or column_name ilike '%loyal%'
        or column_name ilike '%receipt%'
      )
    order by table_name, ordinal_position
  `);
  const result = { tables: tables.rows, columns: columns.rows };
  fs.writeFileSync(
    path.join(process.cwd(), "tmp", "loyalty_audit_sources.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify({
    tables: tables.rows.map((row) => row.table_name),
    matchingColumnCount: columns.rowCount,
  }, null, 2));
  await client.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
