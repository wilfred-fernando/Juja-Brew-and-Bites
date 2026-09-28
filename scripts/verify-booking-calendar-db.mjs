import nextEnv from '@next/env';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const { loadEnvConfig } = nextEnv;
const { Client } = pg;
loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required for rollback-only verification.');
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  await db.connect();
  const schema = `calendar_test_${randomUUID().replaceAll('-', '')}`;
  try {
    await db.query('begin');
    await db.query('set local statement_timeout = 15000');
    await db.query(`create schema ${schema}`);
    await db.query(`create table ${schema}.function_room_bookings (
      id text primary key, customer_name text, package_id bigint, guest_count integer,
      start_at timestamptz, end_at timestamptz, status text)`);
    const insert = (id, status) => db.query(`insert into ${schema}.function_room_bookings values ($1,'Test',1,10,now()+interval '1 day',now()+interval '2 days',$2)`, [id, status]);
    await insert('existing', 'confirmed');
    await insert('pending', 'pending');
    const sql = readFileSync('supabase/migrations/20260928120000_booking_google_calendar.sql', 'utf8')
      .replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, '')
      .replaceAll('public.', `${schema}.`).replaceAll('pg_catalog, public', `pg_catalog, ${schema}`);
    await db.query(sql);
    const row = async id => (await db.query(`select * from ${schema}.booking_google_calendar_sync where booking_id=$1`, [id])).rows[0];
    const update = (id, status) => db.query(`update ${schema}.function_room_bookings set status=$2 where id=$1`, [id, status]);
    assert.ok(await row('existing'));
    assert.equal(await row('pending'), undefined);
    await update('pending', 'confirmed');
    assert.ok(await row('pending'));
    await db.query(`update ${schema}.function_room_bookings set guest_count=20 where id='pending'`);
    assert.equal((await row('pending')).payload.guest_count, '20');
    await update('pending', 'pending');
    assert.equal((await row('pending')).payload.status, 'confirmed');
    await update('pending', 'cancellation_requested');
    assert.equal((await row('pending')).payload.status, 'confirmed');
    const claim = (await db.query(`select * from ${schema}.claim_booking_google_calendar()`)).rows[0];
    assert.ok(claim.lease_token);
    const next = (await db.query(`select * from ${schema}.claim_booking_google_calendar()`)).rows[0];
    assert.notEqual(next.booking_id, claim.booking_id);
    assert.equal((await db.query(`select * from ${schema}.claim_booking_google_calendar()`)).rowCount, 0);
    await update(claim.booking_id, 'cancelled');
    await db.query(`select ${schema}.finish_booking_google_calendar($1,$2,$3,null)`, [claim.booking_id, claim.lease_token, claim.revision]);
    const latest = await row(claim.booking_id);
    assert.ok(Number(latest.revision) > Number(latest.synced_revision), 'Concurrent cancellation remains queued');
    assert.equal(latest.payload.status, 'cancelled');
    const retry = (await db.query(`select * from ${schema}.claim_booking_google_calendar()`)).rows[0];
    await db.query(`select ${schema}.finish_booking_google_calendar($1,$2,$3,'Google 503')`, [retry.booking_id, retry.lease_token, retry.revision]);
    assert.equal((await row(retry.booking_id)).attempts, 1);
    assert.equal((await db.query(`select * from ${schema}.claim_booking_google_calendar()`)).rowCount, 0);
    await db.query(`update ${schema}.booking_google_calendar_sync set lease_until=now()-interval '1 second' where booking_id=$1`, [next.booking_id]);
    assert.equal((await db.query(`select * from ${schema}.claim_booking_google_calendar()`)).rows[0].booking_id, next.booking_id);
    await db.query(`delete from ${schema}.function_room_bookings where id=$1`, [next.booking_id]);
    assert.equal((await row(next.booking_id)).payload.status, 'cancelled');
    const permissions = await db.query(`select has_table_privilege('authenticated', $1, 'select') allowed`, [`${schema}.booking_google_calendar_sync`]);
    assert.equal(permissions.rows[0].allowed, false);
    console.log('PASS: backfill, confirmation, edits, pending requests, cancellations, deletion, leases, revision races, backoff and access restrictions (rolled back).');
  } finally {
    await db.query('rollback');
    await db.end();
  }
}
main().catch(error => { console.error(error.message || error.code || error.name); process.exitCode = 1; });
