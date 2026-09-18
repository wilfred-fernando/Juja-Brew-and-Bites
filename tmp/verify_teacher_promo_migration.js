/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows } = await client.query(`
      select
        exists (
          select 1 from pg_constraint
          where conrelid = 'public.pos_discount_beneficiaries'::regclass
            and conname = 'pos_discount_beneficiaries_beneficiary_type_check'
            and pg_get_constraintdef(oid) ilike '%teacher%'
        ) as teacher_type_allowed,
        exists (
          select 1 from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname = 'save_pos_discount_beneficiary'
            and pg_get_function_identity_arguments(p.oid) like '%p_residency_status text%'
        ) as teacher_save_rpc_ready,
        exists (
          select 1 from public.pos_discounts
          where lower(trim(name)) = lower('Teacher''s Promo 10%')
            and promotion_rules->>'beneficiary_type' = 'teacher'
        ) as teacher_promo_ready;
    `);
    console.log(JSON.stringify(rows[0]));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
