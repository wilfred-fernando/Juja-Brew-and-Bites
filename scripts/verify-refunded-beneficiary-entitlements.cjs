const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL lock_timeout = '5s'");
    await db.query(fs.readFileSync('supabase/migrations/20260923100000_restore_refunded_beneficiary_entitlements.sql', 'utf8'));
    const repaired = (await db.query('select count(*) from refunded_beneficiary_claims_backup_20260923')).rows[0].count;
    assert.equal((await db.query("select count(*) from pos_discount_redemptions r join orders o on o.id=r.order_id where r.status='completed' and lower(trim(o.status))='refunded'")).rows[0].count, '0');
    await db.query('SAVEPOINT fixtures');
    const beneficiary = randomUUID();
    await db.query("insert into pos_discount_beneficiaries(id,full_name,beneficiary_type,id_number,normalized_id_number) values ($1::uuid,$2,'pwd',$1::text,$1::text)", [beneficiary, 'VERIFY REFUND ' + beneficiary]);
    const orderId = randomUUID();
    await db.query("insert into orders(id,branch_id,store_id,items,status,total,receipt_number,created_at) select $1,branch_id,store_id,'[]'::jsonb,'paid','100',$2,now() from orders where store_id is not null limit 1", [orderId, 'VERIFY-' + orderId]);
    const insertClaim = async (group, status, order = orderId) => (await db.query("insert into pos_discount_redemptions(beneficiary_id,business_date,entitlement_group,claim_key,status,order_id) values ($1,(now() at time zone 'Asia/Manila')::date,$2,$3,$4,$5) returning id,status", [beneficiary, group, randomUUID(), status, order])).rows[0];
    const first = await insertClaim('drink', 'completed');
    await db.query("update orders set status='partially_refunded' where id=$1", [orderId]);
    assert.equal((await db.query('select status from pos_discount_redemptions where id=$1', [first.id])).rows[0].status, 'completed');
    await db.query('SAVEPOINT duplicate_claim');
    let duplicate = false;
    try { await insertClaim('drink', 'reserved', null); } catch (e) { duplicate = e.code === '23505'; }
    await db.query('ROLLBACK TO SAVEPOINT duplicate_claim');
    assert.ok(duplicate, 'Partial refunds must still consume the daily entitlement');
    await db.query("update orders set status='refunded',refunded_at=now(),refund_reason='VERIFY full refund' where id=$1", [orderId]);
    const released = (await db.query('select status,refunded_at,refund_reason from pos_discount_redemptions where id=$1', [first.id])).rows[0];
    assert.equal(released.status, 'refunded');
    assert.ok(released.refunded_at);
    assert.equal(released.refund_reason, 'VERIFY full refund');
    const reused = await insertClaim('drink', 'reserved', null);
    assert.equal(reused.status, 'reserved');
    await db.query("update orders set status='refunded' where id=$1", [orderId]);
    assert.equal((await db.query('select status from pos_discount_redemptions where id=$1', [reused.id])).rows[0].status, 'reserved');
    assert.equal((await insertClaim('food', 'completed')).status, 'refunded', 'Late completion must be released');
    await insertClaim('food', 'reserved', null);
    assert.equal((await db.query('select count(*) from pos_discount_redemptions where beneficiary_id=$1', [beneficiary])).rows[0].count, '4', 'Retain refunded history alongside new claims');
    await db.query('ROLLBACK TO SAVEPOINT fixtures');
    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    console.log(JSON.stringify({ repaired, checks: 'full refund release; partial refund stays blocked; same-day reuse; duplicate limit; late completion; idempotent refund; history retained' }));
    await db.query(process.argv.includes('--apply') ? 'COMMIT' : 'ROLLBACK');
    console.log(process.argv.includes('--apply') ? 'Migration committed.' : 'Verification rolled back.');
  } catch (e) { await db.query('ROLLBACK'); throw e; }
  finally { await db.end(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
