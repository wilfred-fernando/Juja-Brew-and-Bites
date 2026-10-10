import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const source = fs.readFileSync(new URL("../lib/push/orderProgress.js", import.meta.url), "utf8");
const { orderProgressData, orderFcmMessage } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const order = { id: "00000000-0000-4000-8000-000000000001", updated_at: "2026-10-10T03:00:00.000Z" };
for (const [status, delivery_status, stage, label, terminal] of [
  ["pending", "", "0", "Received", "false"],
  ["accepted", "", "1", "Preparing", "false"],
  ["preparing", "", "1", "Preparing", "false"],
  ["ready", "", "2", "Ready", "false"],
  ["ready", "out_for_delivery", "3", "Out for delivery", "false"],
  ["ready", "delivered", "4", "Completed", "true"],
  ["completed", "", "4", "Completed", "true"],
  ["cancelled", "delivered", "0", "Order cancelled", "true"],
]) {
  const data = orderProgressData({ ...order, status, delivery_status });
  assert.equal(data.progress, stage);
  assert.equal(data.progress_label, label);
  assert.equal(data.terminal, terminal);
  assert.equal(data.tag, `web-order:${order.id}`);
  assert.ok(Object.values(data).every(value => typeof value === "string"));
}
assert.equal(orderProgressData({ ...order, status: "scheduled" }).trackable, "false");
const data = orderProgressData({ ...order, status: "ready" });
const input = { token: "test-device", title: "JUJA", body: "Ready", data };
const oldApk = orderFcmMessage({ ...input, progressSupported: false });
assert.ok(oldApk.notification);
assert.equal(oldApk.android.notification.sound, "notification");
const newApk = orderFcmMessage({ ...input, progressSupported: true });
assert.equal(newApk.notification, undefined);
assert.equal(newApk.android.notification, undefined);
assert.equal(newApk.data.order_progress, "1");
assert.equal(newApk.data.updated_at, order.updated_at);
const voucher = orderFcmMessage({ ...input, data: { type: "voucher" }, progressSupported: true });
assert.ok(voucher.notification, "Vouchers must keep their standard notifications");
console.log("PASS: order stages, scheduled exclusion, stable card IDs, old/new APK payloads and vouchers");

if (process.argv.includes("--database")) {
  // All SQL is confined to a disposable schema and rolled back. No customer rows are touched.
  process.loadEnvFile(".env.local");
  const require = createRequire(import.meta.url);
  const { Client } = require("pg");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  const schema = `order_progress_verify_${Date.now()}`;
  const migration = fs.readFileSync(new URL("../supabase/migrations/20261010120000_customer_order_progress_push.sql", import.meta.url), "utf8").replaceAll("public.", `${schema}.`);
  assert.ok(!migration.includes("public."));
  await db.connect();
  try {
    const columns = await db.query("select column_name, data_type from information_schema.columns where table_schema='public' and table_name='web_orders'");
    const types = new Map(columns.rows.map(row => [row.column_name, row.data_type]));
    for (const field of ["id", "user_id", "status", "delivery_status", "updated_at"]) {
      assert.ok(types.has(field), `Required web_orders field: ${field}`);
    }
    assert.equal(types.get("id"), "uuid");
    await db.query("begin");
    await db.query(`create schema ${schema};
      create table ${schema}.customer_push_tokens (id uuid primary key);
      create table ${schema}.web_orders (id uuid primary key, user_id uuid, status text,
        delivery_status text, updated_at timestamptz default now(), total numeric);`);
    await db.query(migration);
    await db.query(`insert into ${schema}.web_orders(id, user_id, status) values ($1, $1, 'pending')`, [order.id]);
    assert.equal((await db.query(`select * from ${schema}.customer_order_push_outbox`)).rowCount, 1);
    assert.equal((await db.query(`select * from ${schema}.claim_customer_order_push(null)`)).rowCount, 1);
    assert.equal((await db.query(`select * from ${schema}.claim_customer_order_push(null)`)).rowCount, 0, "Lease excludes concurrent claims");
    await db.query(`update ${schema}.web_orders set status='ready', updated_at=now() + interval '1 second'`);
    const fresh = await db.query(`select * from ${schema}.claim_customer_order_push(null)`);
    assert.equal(fresh.rowCount, 1);
    assert.equal(fresh.rows[0].attempts, 1, "New status resets attempts and lease");
    await db.query(`update ${schema}.web_orders set total=100`);
    assert.equal((await db.query(`select attempts from ${schema}.customer_order_push_outbox`)).rows[0].attempts, 1, "Unrelated edits do not queue alerts");
    await db.query(`update ${schema}.web_orders set status='scheduled'`);
    assert.equal((await db.query(`select * from ${schema}.customer_order_push_outbox`)).rowCount, 0);
    const access = await db.query(`select has_table_privilege('anon', '${schema}.customer_order_push_outbox', 'SELECT') as readable,
      has_function_privilege('authenticated', '${schema}.claim_customer_order_push(uuid)', 'EXECUTE') as callable`);
    assert.equal(access.rows[0].readable, false);
    assert.equal(access.rows[0].callable, false);
    console.log("PASS: SQL migration, capture, lease, status coalescing, scheduled exclusion and access restrictions (rolled back)");
  } finally {
    await db.query("rollback");
    await db.end();
  }
}
