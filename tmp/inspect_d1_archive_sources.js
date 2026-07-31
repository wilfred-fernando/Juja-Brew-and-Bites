const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function loadEnv(file) {
  const target = path.resolve(file);
  if (!fs.existsSync(target)) return;
  for (const line of fs.readFileSync(target, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadEnv(".env.local");
loadEnv(".env.r2-migration");

const candidates = [
  "orders",
  "order_items",
  "receipts",
  "receipt_items",
  "web_orders",
  "cashier_shifts",
  "cashier_pos",
  "pos_shifts",
  "finance_daily_inventory_entries",
  "finance_inventory_transfers",
  "inventory_daily_records",
  "inventory_daily_items",
  "inventory_transactions",
  "audit_logs",
  "activity_logs",
  "notifications",
  "voucher_push_notifications",
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const tableResult = await client.query(
    `select table_name
       from information_schema.tables
      where table_schema = 'public'
        and (
          table_name = any($1::text[])
          or table_name ilike '%audit%'
          or table_name ilike '%activity%'
          or table_name ilike '%notification%'
          or table_name ilike '%shift%'
          or table_name ilike '%inventory_daily%'
          or table_name ilike '%daily_inventory%'
        )
      order by table_name`,
    [candidates]
  );

  for (const { table_name: tableName } of tableResult.rows) {
    const columns = await client.query(
      `select column_name, data_type, udt_name, is_nullable
         from information_schema.columns
        where table_schema = 'public' and table_name = $1
        order by ordinal_position`,
      [tableName]
    );
    const count = await client.query(
      `select count(*)::bigint as count from public.${client.escapeIdentifier(tableName)}`
    );
    console.log(`\n## ${tableName} (${count.rows[0].count} rows)`);
    for (const column of columns.rows) {
      console.log(
        `${column.column_name}\t${column.data_type}\t${column.udt_name}\t${column.is_nullable}`
      );
    }
  }

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
