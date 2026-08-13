const fs = require("fs");
const path = require("path");

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

const { Client } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const tables = [
      "function_room_bookings",
      "web_orders",
      "profiles",
      "paymongo_payments",
      "paymongo_webhook_events",
    ];
    const columns = await client.query(
      `select table_name, ordinal_position, column_name, data_type, udt_name,
              is_nullable, column_default
         from information_schema.columns
        where table_schema = 'public' and table_name = any($1)
        order by table_name, ordinal_position`,
      [tables]
    );
    const constraints = await client.query(
      `select c.conname, c.contype, c.conrelid::regclass::text as table_name,
              pg_get_constraintdef(c.oid, true) as definition
         from pg_constraint c
        where c.connamespace = 'public'::regnamespace
          and c.conrelid = any($1::regclass[])
        order by table_name, c.conname`,
      [tables.map((name) => `public.${name}`)]
    );
    const indexes = await client.query(
      `select tablename as table_name, indexname, indexdef
         from pg_indexes
        where schemaname = 'public' and tablename = any($1)
        order by tablename, indexname`,
      [tables]
    );
    const policies = await client.query(
      `select tablename as table_name, policyname, permissive, roles, cmd, qual, with_check
         from pg_policies
        where schemaname = 'public' and tablename = any($1)
        order by tablename, policyname`,
      [tables]
    );
    const triggers = await client.query(
      `select event_object_table as table_name, trigger_name, action_timing,
              event_manipulation, action_statement
         from information_schema.triggers
        where trigger_schema = 'public' and event_object_table = any($1)
        order by event_object_table, trigger_name, event_manipulation`,
      [tables]
    );

    console.log(JSON.stringify({
      columns: columns.rows,
      constraints: constraints.rows,
      indexes: indexes.rows,
      policies: policies.rows,
      triggers: triggers.rows,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
