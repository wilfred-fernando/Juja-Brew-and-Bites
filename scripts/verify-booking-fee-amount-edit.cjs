require('@next/env').loadEnvConfig(process.cwd());
const { Client } = require('pg');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const actor = async id => db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.jwt.claim.role','authenticated',true)", [id, JSON.stringify({ sub: id, role: 'authenticated' })]);
  const denied = async (sql, args, pattern) => {
    await db.query('savepoint denied'); let error;
    try { await db.query(sql, args); } catch (e) { error = e; }
    await db.query('rollback to savepoint denied');
    assert.ok(error, 'Expected rejection: ' + sql); assert.match(error.message, pattern);
  };
  try {
    await db.query('begin'); await db.query("set local lock_timeout='5s'");
    if (!process.argv.includes('--installed')) await db.query(fs.readFileSync('supabase/migrations/20261109100000_booking_fee_amount_corrections.sql', 'utf8').replace(/^begin;\s*/, '').replace(/commit;\s*$/, ''));
    await db.query('savepoint fixtures');
    const counts = () => one("select (select count(*) from orders) orders,(select count(*) from function_room_bookings) bookings,(select count(*) from booking_reservation_vouchers) vouchers");
    const before = await counts();
    const admin = await one("select id from profiles where lower(role)='super_admin' limit 1");
    const cashier = await one("select p.id,p.store_id from profiles p join stores s on s.id::text=p.store_id::text where lower(p.role)='cashier' and coalesce(s.store_name,s.name,'') ilike '%Pasong Tamo%' limit 1");
    const customer = await one("select id from profiles where lower(role)='customer' limit 1");
    assert.ok(admin && cashier && customer); await actor(admin.id);
    const shift = 'test-fee-amount-' + randomUUID();
    await db.query("insert into cashier_pos(id,store_id,cashier_id,mode,cash_total,created_at) values($1,$2,$3,'open',0,clock_timestamp())", [shift, cashier.store_id, cashier.id]);
    let day = 10;
    const seed = async (extra = {}) => {
      const date = '2089-04-' + day++;
      return (await one('select create_manual_booking($1::json) b', [JSON.stringify({ customer_name: 'Rollback Fee Amount', event_type: 'Test', business_date: date,
        start_at: date + 'T10:00:00+08:00', duration_hours: 3, extension_hours: 0, package_id: 1, guest_count: 1,
        contact_number: '0000000000', email: 'rollback@example.invalid', deposit_amount: 0, payment_method: 'QRPH',
        manual_payment_review: 'approved', payment_status: 'approved', status: 'confirmed', created_via: 'admin', ...extra })])).b;
    };
    const fee = async id => one('select v.*,o.receipt_number,o.total,o.loyalty_points_awarded,o.source_metadata from booking_reservation_vouchers v join orders o on o.id=v.collection_order_id where booking_id=$1', [id]);
    const b = await seed(); assert.equal(await fee(b.id), undefined);
    assert.equal((await one('select admin_booking_fee_is_recorded($1) recorded', [b.id])).recorded, false);
    await db.query('update function_room_bookings set deposit_amount=1000 where id=$1', [b.id]);
    const collected = await fee(b.id); assert.equal(Number(collected.amount), 1000); assert.equal(collected.payment_method, 'QRPH'); assert.equal(collected.shift_id, shift);
    assert.equal((await one('select admin_booking_fee_is_recorded($1) recorded', [b.id])).recorded, true);
    assert.equal(Number(collected.loyalty_points_awarded || 0), 0); assert.equal(collected.source_metadata.exclude_loyalty, true);
    await db.query("update function_room_bookings set deposit_amount=1000,extension_hours=1,status='confirmed' where id=$1", [b.id]);
    assert.equal((await fee(b.id)).collection_order_id, collected.collection_order_id);
    await denied('update function_room_bookings set deposit_amount=1200 where id=$1', [b.id], /Recorded reservation collections cannot be edited/);
    await denied("update function_room_bookings set payment_method='Cash' where id=$1", [b.id], /Recorded reservation collections cannot be edited/);
    const pending = await seed({ status: 'pending' });
    await db.query('update function_room_bookings set deposit_amount=1000 where id=$1', [pending.id]); assert.equal(await fee(pending.id), undefined);
    await db.query("update function_room_bookings set status='confirmed' where id=$1", [pending.id]); assert.ok(await fee(pending.id));
    const legacy = await seed({ deposit_amount: 1000, manual_payment_review: 'pending' });
    await db.query("update function_room_bookings set payment_status='approved' where id=$1", [legacy.id]);
    await db.query('update function_room_bookings set deposit_amount=1000,extension_hours=1 where id=$1', [legacy.id]); assert.equal(await fee(legacy.id), undefined);
    const waived = await seed({ payment_method: 'Waived' });
    await db.query('update function_room_bookings set deposit_amount=1000 where id=$1', [waived.id]); assert.equal(await fee(waived.id), undefined);
    const invalid = await seed();
    await denied('update function_room_bookings set deposit_amount=-1 where id=$1', [invalid.id], /valid non-negative/);
    await denied("update function_room_bookings set deposit_amount='NaN' where id=$1", [invalid.id], /valid non-negative/);
    for (const user of [cashier, customer]) {
      await actor(user.id);
      await denied('update function_room_bookings set deposit_amount=1000 where id=$1', [invalid.id], /Only Admin/);
      await denied('select admin_booking_fee_is_recorded($1)', [b.id], /Admin access/);
    }
    await actor(admin.id);
    const noShift = await seed();
    await db.query("insert into cashier_pos(id,store_id,cashier_id,mode,cash_total,created_at) select 'test-fee-close-'||gen_random_uuid(),store_id,cashier_id,'close',0,greatest(clock_timestamp(),max(created_at)+interval '1 second') from cashier_pos where store_id::text=$1 and cashier_id is not null group by store_id,cashier_id", [String(cashier.store_id)]);
    await denied('update function_room_bookings set deposit_amount=1000 where id=$1', [noShift.id], /Open an online shift/);
    assert.equal(Number((await one('select deposit_amount from function_room_bookings where id=$1', [noShift.id])).deposit_amount), 0);
    await db.query('set constraints all immediate'); await db.query('rollback to savepoint fixtures'); assert.deepEqual(await counts(), before);
    if (process.argv.includes('--apply')) { await db.query('commit'); console.log('Fee-amount correction safeguards installed; all test bookings, receipts and vouchers rolled back.'); }
    else { await db.query('rollback'); console.log('PASS: zero-to-paid receipt, QRPH/shift/zero loyalty, retries and extensions, immutable collections, pending approval, waived/historical exclusions, Admin-only amounts, invalid amounts, no-shift atomic rollback.'); }
  } catch (error) { await db.query('rollback'); throw error; }
  finally { await db.end(); }
})().catch(error => { console.error(error.message, error.where || ''); process.exitCode = 1; });
