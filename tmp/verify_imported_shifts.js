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
    const summary = await client.query(`
      select
        count(*)::int as shift_count,
        min(shift_opening_time) as first_shift,
        max(shift_opening_time) as last_shift
      from public.imported_loyverse_shifts
    `);
    const sample = await client.query(`
      select store_name, pos, shift_number, shift_opening_time, shift_closing_time, expected_cash_amount, actual_cash_amount, difference
      from public.imported_loyverse_shifts
      order by shift_opening_time desc
      limit 3
    `);
    console.log(JSON.stringify({ summary: summary.rows[0], sample: sample.rows }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
