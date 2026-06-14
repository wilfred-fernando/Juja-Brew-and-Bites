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
  const file = process.argv[2];
  if (!file) throw new Error("Usage: node tmp/apply_sql_file.js <migration.sql>");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  const sql = fs.readFileSync(path.resolve(file), "utf8");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
  console.log(`Applied ${file}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
