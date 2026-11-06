require('@next/env').loadEnvConfig(process.cwd());
const { Client } = require('pg');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const ts = require('typescript');

(async () => {
  const source = fs.readFileSync('app/admin/bookings/page.jsx', 'utf8');
  const helpers = source.slice(source.indexOf('const OPERATING_START_HOUR'), source.indexOf('function toManilaOffsetISOString'));
  const context = {}; vm.createContext(context);
  vm.runInContext(helpers + `
    this.result = {superHours:editSlotHours(7,true),adminHours:editSlotHours(18),legacy:editSlotHours(25,true),
      early:computeDateTime('2085-12-10',3).toISOString(),midnight:computeDateTime('2085-12-10',0).toISOString(),
      end:computeEndAt(computeDateTime('2085-12-10',23),5).toISOString()};`, context);
  assert.deepEqual(Array.from(context.result.superHours), Array.from({ length: 24 }, (_, i) => i));
  assert.deepEqual(Array.from(context.result.adminHours), Array.from({ length: 14 }, (_, i) => i + 10));
  assert.ok(context.result.legacy.includes(25));
  assert.equal(context.result.early, '2085-12-09T19:00:00.000Z');
  assert.equal(context.result.midnight, '2085-12-09T16:00:00.000Z');
  assert.equal(context.result.end, '2085-12-10T23:00:00.000Z');
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX }, reportDiagnostics: true });
  assert.equal(compiled.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);

  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const actor = async id => db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.jwt.claim.role','authenticated',true)", [id, JSON.stringify({ sub: id, role: 'authenticated' })]);
  const denied = async (sql, args, pattern) => {
    await db.query('savepoint denied'); let failed = false;
    try { await db.query(sql, args); } catch (error) { assert.match(error.message, pattern); failed = true; }
    await db.query('rollback to savepoint denied'); assert.ok(failed, 'Expected rejection: ' + sql + ' / ' + pattern);
  };
  try {
    await db.query('begin'); await db.query("set local lock_timeout='5s'");
    if (!process.argv.includes('--installed')) await db.query(fs.readFileSync('supabase/migrations/20261106100000_super_admin_booking_outside_hours.sql', 'utf8').replace(/^begin;\s*/, '').replace(/commit;\s*$/, ''));
    await db.query('savepoint fixtures');
    const counts = () => one("select (select count(*) from orders) orders,(select count(*) from function_room_bookings) bookings,(select count(*) from booking_reservation_vouchers) vouchers");
    const before = await counts();
    const roles = {};
    for (const role of ['super_admin', 'admin', 'cashier', 'customer']) {
      roles[role] = (await one('select id from profiles where lower(role)=$1 limit 1', [role]))?.id;
      assert.ok(roles[role], role + ' fixture actor missing');
    }
    const payload = (date, hour, extra = {}) => JSON.stringify({ customer_name: 'Rollback Outside Hours', event_type: 'Test',
      business_date: date, start_at: `${date}T${String(hour).padStart(2,'0')}:00:00+08:00`, duration_hours: 3,
      extension_hours: 0, package_id: 1, guest_count: 1, contact_number: '0000000000', email: 'rollback@example.invalid',
      deposit_amount: 0, payment_method: 'Waived', payment_status: 'waived', status: 'confirmed', created_via: 'admin', ...extra });
    await actor(roles.super_admin);
    const early = (await one('select create_manual_booking($1::json) b', [payload('2085-12-10', 7)])).b;
    assert.equal(early.status, 'confirmed');
    await one('select create_manual_booking($1::json) b', [payload('2085-12-11', 3)]);
    await one('select create_manual_booking($1::json) b', [payload('2085-12-12', 0)]);
    await one('select create_manual_booking($1::json) b', [payload('2085-11-10', 3)]);
    await denied('select create_manual_booking($1::json)', [payload('2085-12-10', 8)], /overlap/);
    await db.query("update function_room_bookings set start_at='2085-12-10T06:00:00+08:00',extension_hours=8 where id=$1", [early.id]);
    const updated = await one('select start_at,end_at from function_room_bookings where id=$1', [early.id]);
    assert.equal((updated.end_at - updated.start_at) / 3600000, 11);
    for (const role of ['admin','cashier','customer']) {
      await actor(roles[role]);
      await denied('select create_booking($1::json)', [payload('2085-12-15', 7, { role: 'super_admin', created_by_user_id: roles.super_admin })], /10 AM and 2 AM/);
      await denied("update function_room_bookings set start_at='2085-12-10T05:00:00+08:00' where id=$1", [early.id], /10 AM and 2 AM/);
    }
    await actor(roles.admin);
    await one('select create_manual_booking($1::json)', [payload('2085-12-16', 10, { extension_hours: 24 })]);
    await actor(roles.cashier);
    await one('select create_manual_booking($1::json)', [payload('2085-12-18', 10)]);
    await denied('select create_booking($1::json)', [payload('2085-12-19', 23, { extension_hours: 1 })], /10 AM and 2 AM/);
    await db.query('set constraints all immediate');
    await db.query('rollback to savepoint fixtures'); assert.deepEqual(await counts(), before);
    if (process.argv.includes('--apply')) { await db.query('commit'); console.log('Super Admin outside-hours policy installed; all fixture bookings rolled back.'); }
    else { await db.query('rollback'); console.log('PASS: 24-hour Super Admin options, Manila dates, new/edit December and non-December bookings, overlap rejection, role-spoof rejection, normal-role restrictions and existing Admin extensions; no receipts or bookings persisted.'); }
  } catch (error) { await db.query('rollback'); throw error; }
  finally { await db.end(); }
})().catch(error => { console.error(error.message, error.where || ''); process.exitCode = 1; });
