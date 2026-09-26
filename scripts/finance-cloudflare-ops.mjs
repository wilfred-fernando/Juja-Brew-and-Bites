import fs from "node:fs";
import nextEnv from "@next/env";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

nextEnv.loadEnvConfig(process.cwd());
const migration = "20260926090000";
const tables = ["finance_expenses", "finance_petty_cash_entries", "finance_petty_cash_funds", "finance_references", "finance_delete_requests", "finance_daily_inventory_entries", "finance_inventory_transfers"];
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000, statement_timeout: 60000 });
await db.connect();
try {
  if (process.argv.includes("--verify")) {
    await db.query("begin");
    try {
      const id = `finance_cf_verify_${randomUUID()}`;
      await db.query("insert into public.finance_references (id, ref_type, name) values ($1, 'supplier', 'Cloudflare rollback-only verification')", [id]);
      await db.query("update public.finance_references set supplier_company_name = 'Verification company', supplier_tin_number = 'TEST' where id = $1", [id]);
      await db.query("delete from public.finance_references where id = $1", [id]);
      const events = (await db.query("select operation, payload from public.finance_cloudflare_outbox where source_id = $1 order by id", [id])).rows;
      assert.deepEqual(events.map((event) => event.operation), ["INSERT", "UPDATE", "DELETE"]);
      assert.equal(events[2].payload.supplier_tin_number, "TEST");
      assert.equal(events[2].payload.supplier_company_name, "Verification company");
      for (const role of ["anon", "authenticated"]) {
        const { rows } = await db.query("select has_table_privilege($1, 'public.finance_cloudflare_outbox', 'SELECT') as can_read, has_table_privilege($1, 'public.finance_cloudflare_outbox', 'DELETE') as can_delete", [role]);
        assert.equal(rows[0].can_read, false);
        assert.equal(rows[0].can_delete, false);
      }
      console.log("PASS: live insert/update/delete capture, supplier payload preservation, and restricted queue access. Test writes rolled back.");
    } finally { await db.query("rollback"); }
  }
  if (process.argv.includes("--apply")) {
    const { rows } = await db.query("select to_regclass('public.finance_cloudflare_outbox') as relation");
    if (!rows[0].relation) {
      // This installation does not use the Supabase CLI migration registry.
      // The outbox and all triggers are created atomically in this transaction.
      const sql = fs.readFileSync(`supabase/migrations/${migration}_finance_cloudflare_outbox.sql`, "utf8").replace(/^begin;/, "").replace(/commit;\s*$/, "");
      await db.query("begin");
      try {
        await db.query("set local lock_timeout = '10s'");
        await db.query(sql);
        await db.query("commit");
        console.log("Finance outbox migration applied.");
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
