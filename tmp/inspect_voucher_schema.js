/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

async function main() {
  loadDotEnvLocal();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is missing");
  const client = new Client({ connectionString });
  await client.connect();

  const { rows: columns } = await client.query(`
    select column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('vouchers', 'loyalty_members', 'promotions')
    order by table_name, ordinal_position
  `);

  const { rows: constraints } = await client.query(`
    select conname, pg_get_constraintdef(c.oid) as definition
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'public'
      and conrelid in ('public.vouchers'::regclass, 'public.loyalty_members'::regclass, 'public.promotions'::regclass)
    order by conrelid::regclass::text, conname
  `);

  const { rows: functions } = await client.query(`
    select p.proname, pg_get_function_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('ensure_vouchers_for_member', 'create_welcome_voucher_if_needed', 'create_voucher_from_campaign')
    order by p.proname
  `);

  console.log(JSON.stringify({ columns, constraints, functions }, null, 2));
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
