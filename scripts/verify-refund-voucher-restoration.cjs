const { loadEnvConfig } = require('@next/env');
const { Client } = require('pg');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
loadEnvConfig(process.cwd());

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  await db.connect();
  const schema = 'refund_voucher_test_' + randomUUID().replaceAll('-', '');
  try {
    await db.query('BEGIN');
    await db.query('SET LOCAL statement_timeout=20000');
    await db.query(`create schema ${schema}`);
    await db.query(`create table ${schema}.orders(id uuid primary key,status text,items jsonb,net_amount numeric,total text,refund_amount numeric,loyalty_member_id uuid,customer_id text,refunded_at timestamptz)`);
    await db.query(`create table ${schema}.vouchers(id uuid primary key,member_id uuid,status text,redeemed_at timestamptz,expires_at timestamptz,points_consumed numeric)`);
    await db.query(`create table ${schema}.order_items(order_id uuid,source_metadata jsonb)`);
    await db.query(fs.readFileSync('supabase/migrations/20261108090000_restore_refunded_order_vouchers.sql','utf8')
      .replace(/^begin;\s*/,'').replace(/commit;\s*$/,'').replaceAll('public.',schema+'.').replaceAll('search_path=public','search_path='+schema));
    const member = randomUUID();
    const seed = async ({ expired=false, amount=159, raw=false, owner=member }={}) => {
      const order=randomUUID(),voucher=randomUUID();
      await db.query(`insert into ${schema}.vouchers values($1,$2,'redeemed',now()-interval '1 minute',now()+($3||' days')::interval,100)`,[voucher,owner,expired?-1:90]);
      await db.query(`insert into ${schema}.orders values($1,'paid',$2,159,'159',$3,$4::uuid,$4::text,now())`,[order,JSON.stringify(raw?[{appliedVoucher:{id:voucher}}]:[]),amount,member]);
      if(!raw) await db.query(`insert into ${schema}.order_items values($1,$2)`,[order,{pos_line_details:{appliedVoucher:{id:voucher}}}]);
      return {order,voucher};
    };
    const refund = pair => db.query(`update ${schema}.orders set status='refunded' where id=$1`,[pair.order]);
    const row = async pair => (await db.query(`select * from ${schema}.vouchers where id=$1`,[pair.voucher])).rows[0];
    const valid=await seed(); await refund(valid);
    assert.equal((await row(valid)).status,'active');
    assert.equal((await row(valid)).redeemed_at,null);
    assert.equal(Number((await row(valid)).points_consumed),100);
    assert.equal((await db.query(`select ${schema}.restore_order_refund_vouchers($1) n`,[valid.order])).rows[0].n,0);
    const expired=await seed({expired:true}); await refund(expired); assert.equal((await row(expired)).status,'expired');
    const raw=await seed({raw:true}); await refund(raw); assert.equal((await row(raw)).status,'active');
    const partial=await seed({amount:20}); await refund(partial); assert.equal((await row(partial)).status,'redeemed');
    const foreign=await seed({owner:randomUUID()}); await refund(foreign); assert.equal((await row(foreign)).status,'redeemed');
    const reused=await seed();
    await db.query(`insert into ${schema}.orders values($1,'paid','[]',159,'159',0,$2::uuid,$2::text,null)`,[randomUUID(),member]);
    await db.query(`insert into ${schema}.order_items select id,$1 from ${schema}.orders where status='paid' and refund_amount=0`,[{pos_line_details:{appliedVoucher:{id:reused.voucher}}}]);
    await refund(reused); assert.equal((await row(reused)).status,'redeemed');
    // A later use must not be released by replaying the earlier refund.
    await db.query(`update ${schema}.vouchers set status='redeemed',redeemed_at=now() where id=$1`,[valid.voucher]);
    await refund(valid); assert.equal((await row(valid)).status,'redeemed');
    assert.equal((await db.query(`select ${schema}.restore_order_refund_vouchers($1) n`,[valid.order])).rows[0].n,0);
    assert.equal((await db.query(`select count(*)::int n from ${schema}.order_voucher_refund_restorations`)).rows[0].n,3);
    assert.equal((await db.query(`select has_function_privilege('authenticated','${schema}.restore_order_refund_vouchers(uuid)','execute') allowed`)).rows[0].allowed,false);
    console.log('PASS: full refund restoration, original expiry, preserved consumed points, item metadata fallback, partial refund exclusion, member ownership, live redemption protection, replay and permissions. All changes rolled back.');
  } finally { await db.query('ROLLBACK'); await db.end(); }
})().catch(error=>{console.error(error.message);process.exitCode=1});
