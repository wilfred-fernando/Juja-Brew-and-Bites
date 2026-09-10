import fs from "node:fs";
import pg from "pg";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const { rows } = await client.query(`
    select
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'stores' and column_name = 'customer_ordering_status'
      ) as has_status_column,
      to_regprocedure('public.set_store_customer_ordering_status(uuid,text)') is not null as has_status_rpc,
      exists (
        select 1 from pg_trigger
        where tgname = 'guard_web_order_store_status_before_insert' and not tgisinternal
      ) as has_web_order_guard,
      (select count(*)::integer from public.stores where customer_ordering_status not in ('open', 'busy', 'closed')) as invalid_store_statuses
  `);
  const result = rows[0];
  if (!result.has_status_column || !result.has_status_rpc || !result.has_web_order_guard || result.invalid_store_statuses !== 0) {
    throw new Error(`Live verification failed: ${JSON.stringify(result)}`);
  }
  console.log("Live store ordering status schema verified:", result);
} finally {
  await client.end();
}
