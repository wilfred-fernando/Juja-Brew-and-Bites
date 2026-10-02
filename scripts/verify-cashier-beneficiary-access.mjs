import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import nextEnv from '@next/env';
import pg from 'pg';
import { ensurePosBeneficiarySession } from '../lib/posBeneficiarySession.js';

const session = { user: { id: 'cashier' } };
let allowed = true;
let refreshes = 0;
const client = {
  auth: {
    getSession: async () => ({ data: { session } }),
    refreshSession: async () => { refreshes++; allowed = true; return { data: { session } }; },
  },
  rpc: async () => ({ data: allowed }),
};
await ensurePosBeneficiarySession(client, 'cashier');
assert.equal(refreshes, 0);
allowed = false;
await ensurePosBeneficiarySession(client, 'cashier');
assert.equal(refreshes, 1, 'Denied session is renewed once');
await assert.rejects(() => ensurePosBeneficiarySession(client, 'other-user'), /login has changed/);
client.rpc = async () => ({ data: false });
await assert.rejects(() => ensurePosBeneficiarySession(client, 'cashier'), /does not have cashier or admin access/);
console.log('PASS: session renewal, changed-account guard, denied-account guard');

if (process.argv.includes('--live')) {
  nextEnv.loadEnvConfig(process.cwd());
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    await db.query('BEGIN');
    const staff = await db.query("select id,role from public.profiles where role in ('cashier','super_admin','customer') order by role");
    const suffix = randomUUID().replaceAll('-', '');
    let verifiedCashiers = 0;
    for (const [index, profile] of staff.rows.entries()) {
      if (profile.role === 'customer' && staff.rows.slice(0,index).some(row => row.role === 'customer')) continue;
      await db.query('SAVEPOINT actor_check');
      await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)", [JSON.stringify({ sub: profile.id, role: 'authenticated' }), profile.id]);
      await db.query('SET LOCAL ROLE authenticated');
      const expected = profile.role !== 'customer';
      assert.equal((await db.query('select public.pos_discount_staff_allowed() as allowed')).rows[0].allowed, expected);
      if (expected) {
        const types = ['senior_citizen','pwd','qcid','teacher'];
        for (const [typeIndex,type] of types.entries()) {
          const id = ['pwd','senior_citizen'].includes(type) ? String(90000 + index * 10 + typeIndex) : `VERIFY${suffix}${index}${typeIndex}`;
          const saved = await db.query('select * from public.save_pos_discount_beneficiary($1,$2,$3,$4)', [type, `Cashier access verification ${suffix} ${index} ${typeIndex}`, id, type === 'qcid' ? 'resident' : null]);
          assert.equal(saved.rows[0].beneficiary_type, type);
          assert.equal(saved.rows[0].created_by, profile.id);
        }
        if (profile.role === 'cashier') verifiedCashiers++;
      } else {
        await assert.rejects(() => db.query("select public.save_pos_discount_beneficiary('qcid','Denied test','DENIED','resident')"), /Only authorized POS staff/);
      }
      await db.query('ROLLBACK TO SAVEPOINT actor_check');
    }
    assert.ok(verifiedCashiers > 0);
    console.log(`PASS: ${verifiedCashiers} cashier accounts can save SC, PWD, QCID and Teacher beneficiaries; customers denied; all test records rolled back`);
  } finally { await db.query('ROLLBACK'); await db.end(); }
}
