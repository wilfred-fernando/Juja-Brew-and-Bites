/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const refresh = await client.query("select * from public.refresh_loyverse_sales_staging()");
  const validation = await client.query("select * from public.loyverse_migration_validation_report order by metric");
  const dryRun = await client.query("select * from public.migrate_loyverse_staged_orders(gen_random_uuid(), true)");
  const reviewSamples = await client.query(`
    select source_receipt_number, loyverse_customer_name, loyverse_phone, loyverse_email, match_confidence, reason, status
    from public.loyverse_customer_match_review
    order by created_at desc
    limit 10
  `);
  const output = {
    refresh: refresh.rows[0],
    validation: validation.rows,
    dry_run: dryRun.rows[0],
    review_samples: reviewSamples.rows,
  };
  const outPath = path.join(process.cwd(), "tmp", "loyverse-staging-validation.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(outPath);
  console.log(JSON.stringify(output, null, 2));
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
