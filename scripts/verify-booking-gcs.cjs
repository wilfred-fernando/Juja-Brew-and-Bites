const { loadEnvConfig } = require('@next/env');
const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
loadEnvConfig(process.cwd());
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for rollback-only verification.');
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  await client.connect();
  const schema = 'gc_test_' + randomUUID().replaceAll('-', '');
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL statement_timeout = 15000');
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`CREATE TABLE ${schema}.function_room_bookings(id uuid primary key, status text, payment_status text, deposit_amount numeric, customer_name text, email text)`);
    await client.query(`CREATE TABLE ${schema}.profiles(id uuid, role text)`);
    await client.query(`CREATE TABLE ${schema}.booking_cancellation_gift_certificates(booking_id uuid)`);
    const actor = (await client.query("SELECT id FROM public.profiles WHERE lower(role) IN ('admin','super_admin') LIMIT 1")).rows[0]?.id;
    assert.ok(actor, 'Need an existing admin identity for approval foreign key');
    await client.query(`INSERT INTO ${schema}.profiles VALUES ($1,'admin')`, [actor]);
    const migration = readFileSync('supabase/migrations/20260912090000_booking_gc_approval_batches.sql','utf8')
      .replaceAll('public.', schema + '.').replaceAll('set search_path = public', 'set search_path = ' + schema);
    await client.query(migration);
    const seed = async (status, payment, amount=1000) => {
      const id = randomUUID();
      await client.query(`INSERT INTO ${schema}.function_room_bookings VALUES ($1,$2,$3,$4,'Test Customer','test@example.com')`,[id,status,payment,amount]);
      return id;
    };
    const batchFor = async id => (await client.query(`SELECT * FROM ${schema}.booking_gc_batches WHERE booking_id=$1`,[id])).rows[0];
    const paid = await seed('cancellation_requested','approved');
    const batch = await batchFor(paid);
    assert.equal(batch.status, 'pending_approval');
    assert.equal((await client.query(`SELECT count(*)::int n, sum(amount)::int total FROM ${schema}.booking_gc_certificates WHERE batch_id=$1`,[batch.id])).rows[0].n,10);
    await client.query(`UPDATE ${schema}.function_room_bookings SET status='cancelled' WHERE id=$1`,[paid]);
    assert.equal((await batchFor(paid)).id,batch.id);
    for (const payment of ['waiting_for_payment','cash_pending','submitted',null]) assert.equal(await batchFor(await seed('cancelled', payment)), undefined);
    assert.equal(await batchFor(await seed('confirmed','approved')),undefined);
    assert.equal(await batchFor(await seed(null,'approved')),undefined);
    assert.equal(await batchFor(await seed('cancelled','approved',0)),undefined);
    await client.query(`SELECT ${schema}.approve_booking_gc_batch($1,$2)`,[batch.id,actor]);
    await client.query(`SELECT ${schema}.approve_booking_gc_batch($1,$2)`,[batch.id,actor]);
    assert.equal((await batchFor(paid)).status,'approved');
    assert.equal((await client.query(`SELECT count(*)::int n FROM ${schema}.booking_gc_certificates WHERE batch_id=$1 AND status='active'`,[batch.id])).rows[0].n,10);
    assert.equal((await client.query(`SELECT status FROM ${schema}.function_room_bookings WHERE id=$1`,[paid])).rows[0].status,'cancelled_gc');
    const rejects = async (id, pattern) => {
      await client.query('SAVEPOINT invalid_approval');
      await assert.rejects(client.query(`SELECT ${schema}.approve_booking_gc_batch($1,$2)`,[id,actor]),pattern);
      await client.query('ROLLBACK TO SAVEPOINT invalid_approval');
    };
    const uneven = await batchFor(await seed('cancelled','approved',1050));
    await rejects(uneven.id,/exactly cover/);
    await client.query('SAVEPOINT unauthorized_approval');
    await assert.rejects(client.query(`SELECT ${schema}.approve_booking_gc_batch($1,$2)`,[uneven.id,randomUUID()]),/Admin access required/);
    await client.query('ROLLBACK TO SAVEPOINT unauthorized_approval');
    const restored = await seed('cancellation_requested','approved');
    const restoredBatch = await batchFor(restored);
    await client.query(`UPDATE ${schema}.function_room_bookings SET status='confirmed' WHERE id=$1`,[restored]);
    await rejects(restoredBatch.id,/Only cancelled/);
    const legacy = await seed('confirmed','approved');
    await client.query(`INSERT INTO ${schema}.booking_cancellation_gift_certificates VALUES ($1)`,[legacy]);
    await client.query(`UPDATE ${schema}.function_room_bookings SET status='cancelled' WHERE id=$1`,[legacy]);
    assert.equal(await batchFor(legacy),undefined);
    for (let i=0;i<2;i++) {
      const claim = await client.query(`UPDATE ${schema}.booking_gc_batches SET email_status='sending' WHERE id=$1 AND email_status IN ('pending','failed') RETURNING id`,[batch.id]);
      assert.equal(claim.rowCount, i === 0 ? 1 : 0);
    }
    const stale = await batchFor(await seed('cancelled','approved'));
    await client.query(`UPDATE ${schema}.booking_gc_batches SET created_at=now()-interval '92 days' WHERE id=$1`,[stale.id]);
    await rejects(stale.id,/expired/);
    const dated = await batchFor(await seed('cancelled','approved'));
    await client.query(`UPDATE ${schema}.booking_gc_batches SET created_at='2026-09-12T04:00:00Z' WHERE id=$1`,[dated.id]);
    assert.equal((await batchFor(dated.booking_id)).expires_at.toISOString(),'2026-12-11T16:00:00.000Z');
    console.log('PASS: denomination, paid eligibility, pending approval, repeat cancellation, repeat approval, full-value preservation, restored booking rejection, legacy protection, email claim. All changes rolled back.');
  } finally { await client.query('ROLLBACK'); await client.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
