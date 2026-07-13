/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

async function main() {
  loadEnv();
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query(`
    select member_id, count(*)::int as welcome_count
      from public.vouchers
     where coalesce(reward_type, '') = 'welcome'
        or upper(coalesce(code, '')) like 'WELCOME%'
        or lower(coalesce(reward_text, '')) like '%welcome voucher%'
     group by member_id
    having count(*) > 1
     order by welcome_count desc
     limit 20
  `);
  console.log(JSON.stringify({ duplicateMembers: rows }, null, 2));
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
