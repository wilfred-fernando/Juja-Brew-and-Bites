require('@next/env').loadEnvConfig(process.cwd());
const { Client } = require('pg');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const actor = async (id, role = 'authenticated') => db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.jwt.claim.role',$3,true)",
    [id || '', JSON.stringify({ sub: id, role }), role]);
  const denied = async (sql, params, pattern) => {
    await db.query('savepoint denied');
    let failed = false;
    try { await db.query(sql, params); } catch (error) { assert.match(error.message, pattern); failed = true; }
    await db.query('rollback to savepoint denied');
    assert.ok(failed, 'Expected policy rejection');
  };
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='5s'");
    if (!process.argv.includes('--installed')) {
      const migration = fs.readFileSync('supabase/migrations/20261103100000_december_booking_policy.sql', 'utf8');
      await db.query(migration.replace(/^begin;\s*/, '').replace(/commit;\s*$/, ''));
    }
    await db.query('savepoint fixtures');
    const before = await one("select (select count(*) from orders) orders,(select count(*) from function_room_bookings) bookings,(select count(*) from booking_gc_batches) batches");
    const admin = await one("select id from profiles where lower(role) in ('admin','super_admin') limit 1");
    const customer = await one("select id from profiles where lower(coalesce(role,'')) not in ('admin','super_admin','cashier') limit 1");
    assert.ok(admin && customer);
    await actor(admin.id);
    const seed = async (date) => one(`insert into function_room_bookings
      (id,customer_name,event_type,contact_number,email,package_id,guest_count,business_date,start_at,status,payment_status,deposit_amount,payment_method)
      values ($1,'Rollback Policy Test','Test','0000000000','rollback@example.invalid',1,1,$2,$3,'pending','approved',1000,'Cash') returning *`,
      [randomUUID(), date, date + 'T10:00:00+08:00']);
    const december = await seed('2080-12-10');
    await db.query("update function_room_bookings set status='cancelled' where id=$1", [december.id]);
    assert.equal(Number((await one('select count(*) n from booking_gc_batches where booking_id=$1', [december.id])).n), 0);
    await denied('insert into booking_gc_batches(booking_id,customer_name,customer_email,amount) values($1,$2,$3,1000)',
      [december.id, 'Test', 'rollback@example.invalid'], /forfeited/);
    await denied("update function_room_bookings set status='cancelled_gc',converted_to_gc=true where id=$1", [december.id], /forfeited/);
    const november = await seed('2080-11-10');
    await db.query("update function_room_bookings set status='cancelled' where id=$1", [november.id]);
    assert.equal(Number((await one('select count(*) n from booking_gc_batches where booking_id=$1', [november.id])).n), 1);
    // A batch created under the old/general policy cannot be approved after
    // its reservation becomes a December booking.
    await db.query("update function_room_bookings set business_date='2080-12-11',start_at='2080-12-11T10:00:00+08:00' where id=$1", [november.id]);
    const batch = await one('select id from booking_gc_batches where booking_id=$1', [november.id]);
    await denied('select approve_booking_gc_batch($1,$2)', [batch.id, admin.id], /forfeited/);
    const future = await seed('2080-12-12');
    await actor(customer.id);
    await db.query("update function_room_bookings set start_at='2080-12-12T14:00:00+08:00' where id=$1", [future.id]);
    // Exercise the actual installed trigger against controlled timestamps in a
    // temporary table; real December dates cannot be 71 hours away in November.
    await db.query(`create temporary table policy_clock_test
      (id int primary key,business_date date,start_at timestamptz,status text,converted_to_gc boolean);
      create trigger policy_clock_test before update on policy_clock_test
      for each row execute function public.enforce_december_booking_policy();
      insert into policy_clock_test values(1,'2080-12-10',statement_timestamp()+interval '71 hours','pending',false),
      (2,'2080-12-10',statement_timestamp()+interval '73 hours','confirmed',false),
      (3,'2080-11-10',statement_timestamp()+interval '49 hours','confirmed',false)`);
    await denied("update policy_clock_test set start_at=start_at+interval '1 hour' where id=1", [], /3 days \(72 hours\)/);
    await denied("update policy_clock_test set business_date='2080-11-10',start_at=start_at+interval '1 hour' where id=1", [], /3 days/);
    await db.query("update policy_clock_test set start_at=start_at+interval '1 hour' where id in (2,3)");
    await db.query("update policy_clock_test set status='cancellation_requested' where id=1");
    await actor(admin.id);
    await db.query("update policy_clock_test set start_at=start_at+interval '1 hour' where id=1");
    await db.query('set constraints all immediate');
    await db.query('rollback to savepoint fixtures');
    assert.deepEqual(await one("select (select count(*) from orders) orders,(select count(*) from function_room_bookings) bookings,(select count(*) from booking_gc_batches) batches"), before);
    const settings = await one('select instructions,reference_notes from messenger_ai_settings where id=1');
    assert.match(settings.instructions, /DECEMBER-ONLY BOOKING POLICY/);
    assert.match(settings.reference_notes, /three days \(72 hours\)/);
    if (process.argv.includes('--apply')) { await db.query('commit'); console.log('December policy installed; all fixtures rolled back.'); }
    else { await db.query('rollback'); console.log('PASS: December forfeiture/no GC issuance or approval, outside-December GC unchanged, customer 72-hour deadline, pending bookings, move-out bypass blocked, staff scheduling preserved; all changes rolled back.'); }
  } catch (error) { await db.query('rollback'); throw error; }
  finally { await db.end(); }
})().catch(error => { console.error(error.message, error.where || ''); process.exitCode = 1; });
