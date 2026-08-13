const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const tables = await client.query(`
      select c.relname as table_name, c.relrowsecurity as rls_enabled
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname in ('paymongo_payments', 'paymongo_webhook_events')
       order by c.relname
    `);
    const columns = await client.query(`
      select table_name, count(*)::int as column_count
        from information_schema.columns
       where table_schema = 'public'
         and table_name in ('paymongo_payments', 'paymongo_webhook_events')
       group by table_name
       order by table_name
    `);
    const policies = await client.query(`
      select tablename as table_name, policyname, cmd
        from pg_policies
       where schemaname = 'public'
         and tablename in ('paymongo_payments', 'paymongo_webhook_events')
       order by tablename, policyname
    `);
    const constraints = await client.query(`
      select conrelid::regclass::text as table_name, conname, contype
        from pg_constraint
       where connamespace = 'public'::regnamespace
         and conrelid in ('public.paymongo_payments'::regclass, 'public.paymongo_webhook_events'::regclass)
       order by table_name, conname
    `);
    console.log(JSON.stringify({ tables: tables.rows, columns: columns.rows, policies: policies.rows, constraints: constraints.rows }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
