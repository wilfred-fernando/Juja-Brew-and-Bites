// Installs new definitions and exercises real database boundaries in ONE
// rolled-back transaction. Never creates lasting bookings, payments or receipts.
const { loadEnvConfig } = require('@next/env');
const { Client } = require('pg');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
loadEnvConfig(process.cwd());
const files = ['supabase/migrations/20261019090000_booking_reservation_vouchers.sql','supabase/migrations/20261019091000_reservation_shift_collections.sql'];
async function main() {
  const db = new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
  await db.connect();
  const current=(await db.query("select to_regprocedure('public.ensure_booking_reservation_receipt(uuid,text,uuid)') installed")).rows[0].installed;
  if(current){
    await db.end();
    require('node:child_process').execFileSync(process.execPath,['scripts/verify-booking-fee-receipts.cjs','--installed'],{stdio:'inherit'});
    return;
  }
  let checks=0;
  const query = (sql,args=[])=>db.query(sql,args);
  const one = async(sql,args=[]) => (await query(sql,args)).rows[0];
  const reject = async(sql,args=[],pattern) => {
    await query('savepoint expected_failure');
    let caught;
    try { await query(sql,args); } catch(error) { caught=error; }
    await query('rollback to savepoint expected_failure');
    assert.ok(caught,'Expected rejection: '+sql);
    if(pattern) assert.match(caught.message,pattern);
    checks++;
  };
  try {
    await query('begin');
    await query("set local lock_timeout='5s'");
    await query("set local statement_timeout='20s'");
    for(const file of process.argv.includes("--installed") ? [] : files) { const sql=fs.readFileSync(file,'utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,''); try { await query(sql); } catch(error) { console.error(file, 'position',error.position,'context',error.where); throw error; } }
    const actor=await one("select id,store_id from public.profiles where lower(role)='cashier' and store_id is not null limit 1");
    assert.ok(actor,'Cashier fixture required');
    const store=String(actor.store_id);
    await query("select set_config('request.jwt.claim.sub',$1,true)",[actor.id]);
    await query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor.id,role:'authenticated'})]);
    const shift='test-reservation-'+randomUUID();
    await query("insert into public.cashier_pos(id,store_id,cashier_id,mode,cash_total,created_at) values($1,$2,$3,'open',0,now()-interval '1 second')",[shift,store,actor.id]);
    const seed=async(day,extra={}) => {
      const data={customer_name:'ROLLBACK RESERVATION TEST',event_type:'Verification',business_date:day,start_at:day+'T10:00:00+08:00',duration_hours:3,
        extension_hours:0,package_id:1,guest_count:1,contact_number:'0000000000',email:'rollback@example.invalid',deposit_amount:1000,payment_status:'approved',payment_method:'Cash',status:'confirmed',...extra};
      return (await one('select public.create_manual_booking($1::json) booking',[JSON.stringify(data)])).booking;
    };
    const booking=await seed('2042-02-22');
    const collect=async(id,method='Cash')=>(await one('select public.collect_booking_reservation_fee($1,$2,$3) voucher',[id,store,method])).voucher;
    const voucher=await collect(booking.id);
    assert.equal(Number(voucher.amount),1000); checks++;
    assert.equal((await collect(booking.id)).code,voucher.code);checks++;
    assert.equal(Number((await one('select count(*) n from public.booking_reservation_vouchers where booking_id=$1',[booking.id])).n),1);checks++;
    await reject('select public.collect_booking_reservation_fee($1,$2,$3)',[booking.id,'wrong-branch','Cash'],/branch/);
    const order={receipt_number:'TEST-'+randomUUID(),order_number:'TEST',store_id:store,total:5000,net_amount:5000,gross_amount:5000,discount_amount:0,subtotal:5000,discount:0,
      items:[],payment_method:'Reservation Fee Applied 1000 + Cash 4000',source_metadata:{payment_splits:[{method:'Reservation Fee Applied',amount:1000},{method:'Cash',amount:4000}]}};
    const items=[{source_metadata:{},name:'Rollback item',quantity:1,unit_price:5000,line_total:5000,gross_amount:5000,discount_amount:0,net_amount:5000}];
    const key=randomUUID();
    const sql='select public.complete_pos_booking_sale($1,$2,$3::jsonb,$4::jsonb) result';
    const args=[key,booking.id,JSON.stringify(order),JSON.stringify(items)];
    await reject(sql,[key,booking.id,JSON.stringify({...order,source_metadata:{payment_splits:[{method:'Reservation Fee Applied',amount:2000},{method:'Cash',amount:3000}]}}),JSON.stringify(items)],/breakdown/);
    const sale=(await one(sql,args)).result;
    assert.equal(Number(sale.order.source_metadata.reservation_credit),1000);checks++;
    assert.equal(Number(sale.order.net_amount),5000);checks++;
    assert.equal(Number(sale.order.source_metadata.reservation_remaining_collected),4000);checks++;
    assert.equal((await one(sql,args)).result.order.id,sale.order.id);checks++;
    await reject(sql,[randomUUID(),...args.slice(1)],/already/);
    await reject("update public.function_room_bookings set status='cancelled' where id=$1",[booking.id],/settled/);
    await reject("update public.orders set status='refunded' where id=$1",[sale.order.id],/reversal/);
    await reject('update public.order_items set quantity=2 where order_id=$1',[sale.order.id],/reversal/);
    await reject('delete from public.orders where id=$1',[sale.order.id],/deleted/);
    const badDirect={...order,id:randomUUID(),dining_option:'VIP Booking '+booking.id,source_metadata:{booking_id:booking.id,payment_splits:order.source_metadata.payment_splits}};
    await reject('insert into public.orders select (jsonb_populate_record(null::public.orders,$1::jsonb)).*',[JSON.stringify(badDirect)],/atomic/);
    await query('set local role authenticated');
    await reject('insert into public.booking_reservation_vouchers(booking_id,amount,payment_method,store_id,cashier_id,shift_id) values($1,1000,$2,$3,$4,$5)',[randomUUID(),'Cash',store,actor.id,shift],/permission denied/);
    await query('reset role');
    const cancelled=await seed('2042-02-23');
    await collect(cancelled.id,'QRPH');
    await query("update public.function_room_bookings set status='cancellation_requested' where id=$1",[cancelled.id]);
    await reject(sql,[randomUUID(),cancelled.id,JSON.stringify(order),JSON.stringify(items)],/confirmed/);
    const waived=await seed('2042-02-24',{deposit_amount:0,payment_method:'Waived'});
    await reject('select public.collect_booking_reservation_fee($1,$2,$3)',[waived.id,store,'Cash'],/positive/);
    const tiny=await seed('2042-02-25');await collect(tiny.id);
    await reject(sql,[randomUUID(),tiny.id,JSON.stringify({...order,total:999,net_amount:999}),JSON.stringify(items)],/cover/);
    const listed=(await one('select public.list_pos_confirmed_bookings($1) rows',[store])).rows;
    assert.ok(!listed.some(row=>row.id===booking.id));checks++;
    const close='test-close-'+randomUUID();
    await query("insert into public.cashier_pos(id,store_id,cashier_id,mode,cash_total,sales_summary,created_at) values($1,$2,$3,'close',0,'{}',clock_timestamp())",[close,store,actor.id]);
    const summary=(await one('select sales_summary from public.cashier_pos where id=$1',[close])).sales_summary;
    assert.equal(Number(summary.reservationFeeCollected),3000);checks++;
    assert.equal(Number(summary.reservationCashCollected),2000);checks++;
    assert.equal(Number(summary.expectedCash),2000);checks++;
    const closeRow=await one('select * from public.cashier_pos where id=$1',[close]);
    await query('select public.finance_capture_closed_shift($1::jsonb,$2::jsonb)',[JSON.stringify({...closeRow,_finance_refresh:true}),JSON.stringify([sale.order])]);
    const finance=await one('select cash_sales,payments from public.finance_cash_closed_shifts where id=$1',[close]);
    assert.equal(Number(finance.cash_sales),6000);checks++;
    assert.equal(Number(finance.payments.QRPH),1000);checks++;
    assert.equal(finance.payments['Reservation Fee Applied'],undefined);checks++;
    assert.equal((await one("select public.finance_non_cash_channel('Reservation Fee Applied') channel")).channel,null);checks++;
    const afterClose=await seed('2042-02-26');
    await reject('select public.collect_booking_reservation_fee($1,$2,$3)',[afterClose.id,store,'Cash'],/Open/);
    await query("select set_config('request.jwt.claim.sub','',true)");
    await query("select set_config('request.jwt.claims','{}',true)");
    await reject('select public.list_pos_confirmed_bookings($1)',[store],/login/);
    await query('set constraints all immediate');
    console.log(`Reservation database verification passed (${checks} assertions); all writes rolled back.`);
  } finally {await query('rollback');await db.end();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
