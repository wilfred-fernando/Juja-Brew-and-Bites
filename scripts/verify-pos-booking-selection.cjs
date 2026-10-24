const {loadEnvConfig}=require('@next/env');
const {Client}=require('pg');
const fs=require('node:fs');
const assert=require('node:assert/strict');
loadEnvConfig(process.cwd());
const file='20261024090000_pos_unsettled_booking_selection.sql';
(async()=>{
  const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='5s'");
    const sql=fs.readFileSync('supabase/migrations/'+file,'utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,'');
    await db.query(sql);
    const actor=(await db.query("select id,store_id from profiles where role='cashier' and store_id='bcfa9d8f-f2e5-4573-b3e3-635901ec7a4e' limit 1")).rows[0];
    assert(actor);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor.id]);
    const list=async store=>(await db.query('select list_pos_confirmed_bookings($1) rows',[store])).rows[0].rows;
    const rows=await list(actor.store_id);
    const micah=rows.find(row=>row.id==='41904af8-fa94-44b7-8319-a656e4bd5f0f');
    assert(micah,'Ended unsettled Micah booking is selectable');
    assert.equal(micah.customer_name,'Micah Songco');
    assert.equal(Number(micah.voucher.amount),1000);
    assert(rows.some(row=>new Date(row.start_at)>new Date()),'Upcoming bookings remain available');
    await db.query('savepoint unavailable');
    await db.query("update function_room_bookings set status='cancelled' where id=$1",[micah.id]);
    assert(!(await list(actor.store_id)).some(row=>row.id===micah.id));
    await db.query('rollback to savepoint unavailable');
    await db.query('savepoint expired');
    await db.query("update function_room_bookings set payment_status='expired' where id=$1",[micah.id]);
    assert(!(await list(actor.store_id)).some(row=>row.id===micah.id));
    await db.query('rollback to savepoint expired');
    await db.query('savepoint wrong_branch');
    await assert.rejects(()=>list('e916bee8-3770-4650-9b46-d2e7d3ad49e6'),/Wrong POS branch/);
    await db.query('rollback to savepoint wrong_branch');
    await db.query('savepoint settlement');
    const {randomUUID}=require('node:crypto');
    const receipt=(await db.query('select * from generate_receipt_number($1)',[actor.store_id])).rows[0];
    const draft={id:randomUUID(),store_id:actor.store_id,branch_id:actor.store_id,
      receipt_number:receipt.receipt_number,order_number:receipt.receipt_number,
      total:3181,net_amount:3181,gross_amount:3181,subtotal:3181,discount:0,discount_amount:0,
      payment_method:'Cash',items:[{name:'Rollback booking bill',quantity:1,unitPrice:3181}],
      source_metadata:{payment_splits:[{method:'Cash',amount:2181},{method:'Reservation Fee Applied',amount:1000}]}};
    const items=[{name:'Rollback booking bill',quantity:1,unit_price:3181,line_total:3181,gross_amount:3181,discount_amount:0,net_amount:3181,source_metadata:{}}];
    const checkoutKey=randomUUID();
    const settle=async key=>(await db.query('select complete_pos_booking_sale($1,$2,$3::jsonb,$4::jsonb) result',[key,micah.id,JSON.stringify(draft),JSON.stringify(items)])).rows[0].result;
    const sale=await settle(checkoutKey);
    assert.equal(sale.order.source_metadata.reservation_booking_name,'Micah Songco');
    assert(!(await list(actor.store_id)).some(row=>row.id===micah.id),'Settled booking is excluded');
    assert.equal((await settle(checkoutKey)).order.id,sale.order.id,'Checkout replay is idempotent');
    await db.query('rollback to savepoint settlement');
    const definition=(await db.query("select pg_get_functiondef('public.complete_pos_booking_sale(uuid,uuid,jsonb,jsonb,uuid[])'::regprocedure) body")).rows[0].body;
    assert(definition.includes("'reservation_booking_name',booking.customer_name"));
    if(process.argv.includes('--apply')){
      if ((await db.query("select to_regclass('supabase_migrations.schema_migrations') registry")).rows[0].registry) {
        await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3) on conflict(version) do nothing',[file.split('_')[0],'pos_unsettled_booking_selection',[sql]]);
      }
      await db.query('commit');
      console.log('APPLIED: confirmed unpaid bookings stay selectable; checkout stores customer name');
    }else{await db.query('rollback');console.log('PASS (rollback): Micah restored, future bookings, cancelled/expired exclusions, branch authorization, name metadata');}
  }catch(error){await db.query('rollback');throw error;}finally{await db.end();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
