const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Client } = require('pg');

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL lock_timeout = '5s'");
    const before = (await db.query('select id, "Points balance", "Available points" from loyalty_members order by id')).rows;
    await db.query(fs.readFileSync('supabase/migrations/20260921190000_stamp_receipt_loyalty_balance.sql', 'utf8'));
    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    const receipts = (await db.query("select id, receipt_number, receipt_points_balance from orders where receipt_number in ('D7205791', 'D2884352') order by receipt_number")).rows;
    assert.deepEqual(receipts.map(r => r.receipt_points_balance), ['81.68', '65.80']);
    assert.deepEqual((await db.query('select id, "Points balance", "Available points" from loyalty_members order by id')).rows, before);
    await db.query('SAVEPOINT stamp_tests');
    const id = receipts[0].id;
    await db.query('update orders set receipt_points_balance = 999 where id = $1', [id]);
    assert.equal((await db.query('select receipt_points_balance from orders where id=$1', [id])).rows[0].receipt_points_balance, '81.68');
    await db.query('update orders set receipt_points_balance = null where id = $1', [id]);
    assert.equal((await db.query('select receipt_points_balance from orders where id=$1', [id])).rows[0].receipt_points_balance, '81.68');
    // Recreate this existing award inside the rolled-back test without advancing the identity sequence.
    await db.query('create temporary table test_stamp_event on commit drop as select * from loyalty_point_award_events where source_type=\'order\' and source_id=$1', [id]);
    await db.query("delete from loyalty_point_award_events where source_type='order' and source_id=$1", [id]);
    await db.query('alter table orders disable trigger preserve_receipt_points_balance');
    await db.query('update orders set receipt_points_balance=null where id=$1', [id]);
    await db.query('alter table orders enable trigger preserve_receipt_points_balance');
    await db.query('insert into loyalty_point_award_events overriding system value select * from test_stamp_event');
    assert.equal((await db.query('select receipt_points_balance from orders where id=$1', [id])).rows[0].receipt_points_balance, '81.68');
    await db.query('ROLLBACK TO SAVEPOINT stamp_tests');
    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    console.log(JSON.stringify({ receipts, backupRows: (await db.query('select count(*) from receipt_points_stamp_backup_20260921')).rows[0].count, checks: 'historical balances, unchanged member balances, immutable stamp, automatic award stamping, deferred constraints passed' }));
    if (process.argv.includes('--apply')) {
      await db.query('COMMIT');
      console.log('Migration committed.');
    } else {
      await db.query('ROLLBACK');
      console.log('Verification rolled back.');
    }
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { await db.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
