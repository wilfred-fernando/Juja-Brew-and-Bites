const { loadEnvConfig } = require('@next/env');
const { Client } = require('pg');
const fs = require('node:fs');
const assert = require('node:assert/strict');
loadEnvConfig(process.cwd());

(async()=>{
  const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
  await db.connect();
  const order='c015b031-bbe7-4447-8cd6-fcf04fea8463',other='252a3370-134f-4469-b237-a44a7ba83172';
  const voucher='c4c571bb-b2ce-4403-afbc-44425e3265a5',member='0cd48d62-abf0-462f-9ed6-25c5517f4adf';
  const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
  try {
    await db.query('BEGIN');
    await db.query("set local lock_timeout='5s'");
    await db.query("set local statement_timeout='30s'");
    if(!(await rows("select to_regclass('public.order_voucher_refund_restorations') installed"))[0].installed){
      await db.query(fs.readFileSync('supabase/migrations/20261108090000_restore_refunded_order_vouchers.sql','utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,''));
    }
    const orders=await rows('select * from orders where id=any($1::uuid[]) order by id for update',[[order,other]]);
    assert.equal(orders.length,2);
    for(const sale of orders){assert.equal(sale.status,'refunded');assert.equal(Number(sale.loyalty_points_awarded),0);assert.equal(sale.loyalty_member_id,member);}
    assert.equal(orders.find(o=>o.id===order).receipt_number,'P8256344');
    const balance=await rows('select * from loyalty_members where id=$1 for update',[member]);
    const vouchers=await rows('select * from vouchers where member_id=$1 order by id for update',[member]);
    const before=vouchers.find(v=>v.id===voucher);
    assert.equal(before.code,'PTS100-3-A5F0007D');
    assert.ok(['redeemed','active'].includes(before.status));
    assert.ok(new Date(before.expires_at)>new Date());
    const restored=(await rows('select public.restore_order_refund_vouchers($1) n',[order]))[0].n;
    assert.equal(restored,before.status==='redeemed'?1:0);
    const after=(await rows('select * from vouchers where id=$1',[voucher]))[0];
    assert.equal(after.status,'active');assert.equal(after.redeemed_at,null);
    assert.equal(String(after.points_consumed),String(before.points_consumed));
    assert.deepEqual(after.expires_at,before.expires_at);
    const {status:previousStatus,redeemed_at:previousRedeemed,...beforeRest}=before;
    const {status:restoredStatus,redeemed_at:restoredRedeemed,...afterRest}=after;
    assert.deepEqual(afterRest,beforeRest);
    assert.deepEqual(await rows('select * from loyalty_members where id=$1',[member]),balance);
    assert.deepEqual(await rows('select * from orders where id=any($1::uuid[]) order by id',[[order,other]]),orders);
    assert.deepEqual(await rows('select * from vouchers where member_id=$1 and id<>$2 order by id',[member,voucher]),vouchers.filter(v=>v.id!==voucher));
    assert.equal((await rows('select public.restore_order_refund_vouchers($1) n',[order]))[0].n,0);
    assert.equal((await rows('select count(*)::int n from order_voucher_refund_restorations where order_id=$1 and voucher_id=$2',[order,voucher]))[0].n,1);
    await db.query(process.argv.includes('--apply')?'COMMIT':'ROLLBACK');
    console.log(JSON.stringify({applied:process.argv.includes('--apply'),receipt:'P8256344',voucher:after.code,status:after.status,restored,expiryPreserved:true,pointsUnchanged:true,otherVoucherAndReceiptsUnchanged:true,pointsBalance:balance[0]['Points balance'],availablePoints:balance[0]['Available points']}));
  }catch(error){await db.query('ROLLBACK');throw error;}finally{await db.end();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
