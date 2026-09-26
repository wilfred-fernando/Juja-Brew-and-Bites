import fs from "node:fs";
import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());
const migration = "20260926090000";
const tables = ["finance_expenses", "finance_petty_cash_entries", "finance_petty_cash_funds", "finance_references", "finance_delete_requests", "finance_daily_inventory_entries", "finance_inventory_transfers"];
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000, statement_timeout: 60000 });
await db.connect();
try {
  if (process.argv.includes("--apply")) {
    const { rows } = await db.query("select version from supabase_migrations.schema_migrations where version = $1", [migration]);
    if (!rows.length) {
      // Run the migration and record its version in one transaction.
      const sql = fs.readFileSync(`supabase/migrations/${migration}_finance_cloudflare_outbox.sql`, "utf8").replace(/^begin;/, "").replace(/commit;\s*$/, "");
      await db.query("begin");
      try {
        await db.query("set local lock_timeout = '10s'");
        await db.query(sql);
        await db.query("insert into supabase_migrations.schema_migrations(version, name, statements) values ($1, $2, $3)", [migration, "finance_cloudflare_outbox", [sql]]);
        await db.query("commit");
        console.log("Finance outbox migration applied and registered.");
      } catch (error) { await db.query("rollback"); throw error; }
    } else console.log("Finance outbox migration already applied.");
  }
  for (const table of tables) {
    const result = await db.query(`select count(*)::int as count from public.${table}`);
    console.log(JSON.stringify({ table, ...result.rows[0] }));
  }
  const exists = await db.query("select to_regclass('public.finance_cloudflare_outbox') as relation");
  if (exists.rows[0].relation) {
    console.log(JSON.stringify({ queue: (await db.query("select source_table, count(*)::int as pending from public.finance_cloudflare_outbox group by source_table order by source_table")).rows }));
    console.log(JSON.stringify({ triggers: (await db.query("select event_object_table, event_manipulation from information_schema.triggers where trigger_name = 'finance_cloudflare_change' order by 1,2")).rows }));
  }
} finally { await db.end(); }
