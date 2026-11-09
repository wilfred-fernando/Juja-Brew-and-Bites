require('@next/env').loadEnvConfig(process.cwd());
const { Client } = require('pg');
const assert = require('node:assert/strict');
const BOOKING_ID = '1d10812f-6dd1-47de-a065-014a5d0e37cd';
const EXPECTED_SHIFT = 'open-1794156752698';

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  try {
    await db.query('begin'); await db.query("set local lock_timeout='5s'");
    const before = await one('select * from function_room_bookings where id=$1 for update', [BOOKING_ID]);
    assert.equal(before.reference_code, 'JUJA-20261109-28aa4'); assert.equal(before.customer_name, 'Queency Gregorio');
    assert.equal(before.status, 'confirmed'); assert.equal(before.payment_status, 'approved'); assert.equal(before.payment_method, 'QRPH');
    const existing = await one('select * from booking_reservation_vouchers where booking_id=$1', [BOOKING_ID]);
    if (existing) {
      assert.equal(Number(before.deposit_amount), 1000); assert.equal(Number(existing.amount), 1000); assert.ok(existing.collection_order_id);
      console.log('Already corrected; existing receipt retained.'); await db.query('rollback'); return;
    }
    assert.equal(Number(before.deposit_amount), 0);
    assert.equal(Number((await one("select count(*) n from orders where source_metadata->>'reservation_fee_booking_id'=$1", [BOOKING_ID])).n), 0);
    const snapshot = () => one(`select
      (select md5(coalesce(jsonb_agg(to_jsonb(b) order by b.id)::text,'')) from function_room_bookings b where id<>$1) bookings,
      (select md5(coalesce(jsonb_agg(to_jsonb(v) order by v.booking_id)::text,'')) from booking_reservation_vouchers v where booking_id<>$1) vouchers`, [BOOKING_ID]);
    const others = await snapshot();
    await db.query('update function_room_bookings set deposit_amount=1000 where id=$1', [BOOKING_ID]);
    const receipt = (await one('select ensure_booking_reservation_receipt($1) v', [BOOKING_ID])).v;
    assert.equal(receipt.shift_id, EXPECTED_SHIFT); assert.equal(Number(receipt.amount), 1000);
    const order = await one('select id,receipt_number,total,payment_method,status,loyalty_points_awarded,source_metadata from orders where id=$1', [receipt.collection_order_id]);
    assert.equal(Number(order.total), 1000); assert.equal(order.payment_method, 'QRPH'); assert.equal(order.status, 'paid');
    assert.equal(Number(order.loyalty_points_awarded || 0), 0); assert.equal(order.source_metadata.exclude_loyalty, true);
    assert.equal((await one('select ensure_booking_reservation_receipt($1) v', [BOOKING_ID])).v.collection_order_id, order.id);
    assert.equal(Number((await one("select count(*) n from orders where source_metadata->>'reservation_fee_booking_id'=$1", [BOOKING_ID])).n), 1);
    const after = await one('select * from function_room_bookings where id=$1', [BOOKING_ID]);
    const withoutAmount = row => { const copy = { ...row }; delete copy.deposit_amount; return copy; };
    assert.deepEqual(withoutAmount(after), withoutAmount(before)); assert.deepEqual(await snapshot(), others);
    await db.query('set constraints all immediate');
    if (process.argv.includes('--apply')) await db.query('commit'); else await db.query('rollback');
    console.log(JSON.stringify({ applied: process.argv.includes('--apply'), booking: before.reference_code, customer: before.customer_name,
      amount: 1000, method: 'QRPH', receipt: order.receipt_number, shift: receipt.shift_id, points: 0, otherBookingsAndVouchersUnchanged: true }));
  } catch (error) { await db.query('rollback'); throw error; }
  finally { await db.end(); }
})().catch(error => { console.error(error.message, error.where || ''); process.exitCode = 1; });
