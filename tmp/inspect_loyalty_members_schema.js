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

async function main() {
  loadEnv();
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const columns = await client.query(`
      select column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = 'loyalty_members'
      order by ordinal_position
    `);
    const constraints = await client.query(`
      select conname, pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conrelid = 'public.loyalty_members'::regclass
      order by conname
    `);
    const samples = await client.query(`
      select customer_code
      from public.loyalty_members
      where customer_code is not null and customer_code <> ''
      order by customer_code desc
      limit 10
    `);
    const sequence = await client.query(`
      select
        last_value,
        is_called,
        (
          select max((substring(customer_code from '^JUJA[0-9]{4}([0-9]{6})$'))::bigint)
          from public.loyalty_members
          where customer_code ~ '^JUJA[0-9]{10}$'
        ) as max_suffix
      from public.loyalty_customer_code_seq
    `);
    const trigger = await client.query(`
      select tgname, tgenabled
      from pg_trigger
      where tgrelid = 'public.loyalty_members'::regclass
        and tgname = 'trg_generate_loyalty_customer_code'
    `);
    console.log(JSON.stringify({ columns: columns.rows, constraints: constraints.rows, samples: samples.rows, sequence: sequence.rows[0], trigger: trigger.rows[0] }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
