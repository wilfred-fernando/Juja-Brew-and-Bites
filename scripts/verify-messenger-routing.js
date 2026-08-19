/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

async function main() {
  loadLocalEnv();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows } = await client.query(`
      select
        (select count(*)::int from public.messenger_flows) as flows,
        (select count(*)::int from public.messenger_flow_nodes) as nodes,
        (select count(*)::int from public.messenger_triggers) as triggers,
        (select count(*)::int from public.messenger_flows where status = 'published') as published_flows
    `);
    const result = rows[0];
    if (result.flows < 5 || result.nodes < 5 || result.triggers < 15 || result.published_flows < 5) {
      throw new Error(`Messenger routing seed is incomplete: ${JSON.stringify(result)}`);
    }
    console.log("Messenger routing verified:", result);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});

