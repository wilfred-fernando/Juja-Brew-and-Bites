/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

async function tableCount(client, tableName) {
  const ident = tableName.split(".").map((part) => `"${part.replace(/"/g, '""')}"`).join(".");
  const result = await client.query(`select count(*)::bigint as count from ${ident}`);
  return result.rows[0]?.count || "0";
}

async function main() {
  loadEnv();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const tableResult = await client.query(`
    select table_schema, table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
      and (
        table_name ilike '%loyverse%'
        or table_name ilike '%import%'
        or table_name ilike '%receipt%'
        or table_name ilike '%sales%'
        or table_name in ('orders', 'order_items', 'loyalty_members', 'profiles', 'customers', 'menu_items', 'stores')
      )
    order by table_name
  `);

  const tables = [];
  for (const row of tableResult.rows) {
    const tableName = `${row.table_schema}.${row.table_name}`;
    const columns = await client.query(
      `
      select column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = $1 and table_name = $2
      order by ordinal_position
      `,
      [row.table_schema, row.table_name]
    );
    const keys = await client.query(
      `
      select
        tc.constraint_type,
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name as foreign_table_name,
        ccu.column_name as foreign_column_name
      from information_schema.table_constraints tc
      left join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
      left join information_schema.constraint_column_usage ccu
        on tc.constraint_name = ccu.constraint_name
        and tc.table_schema = ccu.table_schema
      where tc.table_schema = $1 and tc.table_name = $2
      order by tc.constraint_type, tc.constraint_name, kcu.ordinal_position
      `,
      [row.table_schema, row.table_name]
    );
    const sample = await client.query(
      `select * from "${row.table_schema}"."${row.table_name}" limit 2`
    );
    tables.push({
      table: tableName,
      row_count: await tableCount(client, tableName),
      columns: columns.rows,
      constraints: keys.rows,
      sample: sample.rows,
    });
  }

  const outPath = path.join(process.cwd(), "tmp", "loyverse-import-inspection.json");
  fs.writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), tables }, null, 2));
  console.log(outPath);
  console.log(JSON.stringify(tables.map((table) => ({
    table: table.table,
    row_count: table.row_count,
    columns: table.columns.map((column) => column.column_name),
  })), null, 2));

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
