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
    select table_schema, table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
      and table_name ~* '(loyal|point|audit|activ|histor|receipt|refund)'
    order by table_name
  `);
  const functions = await client.query(`
    select p.proname, pg_get_function_identity_arguments(p.oid) as args,
           pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname ~* '(loyal|point|refund|voucher)'
    order by p.proname
  `);
  const triggers = await client.query(`
    select event_object_table, trigger_name, event_manipulation, action_statement
    from information_schema.triggers
    where trigger_schema = 'public'
      and (event_object_table ~* '(loyal|order|receipt|refund)' or trigger_name ~* '(loyal|point|refund)')
    order by event_object_table, trigger_name
  `);
  const result = { tables: tables.rows, functions: functions.rows, triggers: triggers.rows };
  fs.writeFileSync(
    path.join(process.cwd(), "tmp", "loyalty_ledger_sources.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify({
    tables: tables.rows.map((row) => row.table_name),
    functions: functions.rows.map((row) => `${row.proname}(${row.args})`),
    triggers: triggers.rows.map((row) => `${row.event_object_table}.${row.trigger_name}`),
  }, null, 2));
  await client.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
