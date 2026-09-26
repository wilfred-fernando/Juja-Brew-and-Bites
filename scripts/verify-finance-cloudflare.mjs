import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { syncFinance } from "../cloudflare/d1-archive/src/finance.js";

const db = new DatabaseSync(":memory:");
db.exec(fs.readFileSync("cloudflare/d1-archive/finance-schema.sql", "utf8"));
let queue = [];
let failWrite = false;
let failAck = false;
let acknowledged = 0;
const env = {
  FINANCE_SUPABASE_URL: "https://example.supabase.co",
  FINANCE_SUPABASE_SERVICE_KEY: "test-only",
  ARCHIVE_DB: {
    prepare(sql) { return { bind(...args) { return { sql, args }; } }; },
    async batch(statements) {
      if (failWrite) throw new Error("D1 unavailable");
      db.exec("BEGIN");
      try {
        for (const { sql, args } of statements) db.prepare(sql).run(...args);
        db.exec("COMMIT");
        return statements.map(() => ({ success: true }));
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  },
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, options) => {
  if (options.method === "DELETE") {
    if (failAck) return new Response(null, { status: 503 });
    acknowledged += queue.length;
    queue = [];
    return new Response(null, { status: 204 });
  }
  return Response.json(queue);
};
const event = (id, operation, name = "Supplier") => ({
  id, source_table: "finance_references", source_id: "supplier-1", operation,
  payload: { id: "supplier-1", name, supplier_tin_number: "test-tin", custom_future_field: "preserved" },
  created_at: "2026-09-26T00:00:00Z",
});
try {
  queue = [event(1, "INSERT")];
  failWrite = true;
  await assert.rejects(syncFinance(env), /D1 unavailable/);
  assert.equal(acknowledged, 0);
  failWrite = false; failAck = true;
  await assert.rejects(syncFinance(env), /DELETE failed/);
  assert.equal(queue.length, 1);
  failAck = false;
  await syncFinance(env);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM finance_events").get().n, 1);
  queue = [event(3, "DELETE", "Updated"), event(2, "UPDATE", "Older")];
  await syncFinance(env);
  const row = db.prepare("SELECT * FROM finance_records").get();
  assert.equal(row.event_id, 3);
  assert.equal(row.is_deleted, 1);
  assert.equal(JSON.parse(row.payload_json).name, "Updated");
  assert.equal(JSON.parse(row.payload_json).custom_future_field, "preserved");
  queue = [event(4, "INSERT", "Recreated")];
  await syncFinance(env);
  assert.equal(db.prepare("SELECT is_deleted FROM finance_records").get().is_deleted, 0);
  queue = [{ ...event(5, "INSERT"), source_table: "profiles" }];
  await assert.rejects(syncFinance(env), /Invalid finance queue event/);
  assert.equal(queue.length, 1);
  console.log("PASS: full payload, failed-write retention, failed-ack retry, idempotency, ordering, deletion, recreation, and table allowlist.");
} finally {
  globalThis.fetch = originalFetch;
  db.close();
}
