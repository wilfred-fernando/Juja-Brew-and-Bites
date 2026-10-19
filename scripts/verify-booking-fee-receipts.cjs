const {loadEnvConfig}=require('@next/env');
const {Client}=require('pg');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
loadEnvConfig(process.cwd());
async function main(){
  const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
  await db.connect();let checks=0;
  const query=(sql,args=[])=>db.query(sql,args);
  const one=async(sql,args=[]) => (await query(sql,args)).rows[0];
  const reject=async(sql,args,pattern)=>{await query('savepoint reject_case');let error;try{await query(sql,args);}catch(e){error=e;}
    await query('rollback to savepoint reject_case');assert.ok(error,'Expected rejection: '+sql+' pattern '+pattern);assert.match(error.message,pattern);checks++;};
  try{
    await query('begin');await query("set local lock_timeout='5s'");await query("set local statement_timeout='20s'");
    if(!process.argv.includes('--installed')){
      const migration=fs.readFileSync('supabase/migrations/20261019120000_booking_fee_receipts.sql','utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,'');
      try { await query(migration); } catch (e) { console.error("Migration position",e.position, migration.slice(Math.max(0, Number(e.position)-160), Number(e.position)+160)); throw e; }
    }
    const actor=await one("select p.id,p.store_id from public.profiles p join public.stores s on s.id::text=p.store_id::text where lower(p.role)='cashier' and coalesce(s.store_name,s.name,'') ilike '%Pasong Tamo%' limit 1");
    assert.ok(actor);const store=String(actor.store_id);
    await query("select set_config('request.jwt.claim.sub',$1,true)",[actor.id]);
    await query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor.id,role:'authenticated'})]);
    const shift='test-fee-receipt-'+randomUUID();
    await query("insert into public.cashier_pos(id,store_id,cashier_id,mode,cash_total,created_at) values($1,$2,$3,'open',0,now()-interval '1 second')",[shift,store,actor.id]);
    let day=20;
    const seed=async(extra={})=>(await one('select public.create_manual_booking($1::json) b',[JSON.stringify({
      customer_name:'ROLLBACK FEE RECEIPT TEST',event_type:'Verification',business_date:`2043-03-${day}`,start_at:`2043-03-${day++}T10:00:00+08:00`,
      duration_hours:3,extension_hours:0,package_id:1,guest_count:1,contact_number:'0000000000',email:'rollback@example.invalid',
      deposit_amount:1000,payment_status:'waiting_for_payment',payment_method:'QRPH',status:'pending',...extra})])).b;
    const b=await seed();
    assert.equal((await one('select count(*)::int n from public.booking_reservation_vouchers where booking_id=$1',[b.id])).n,0);checks++;
    await query("update public.function_room_bookings set status='confirmed',payment_status='approved' where id=$1",[b.id]);
    const v=await one('select * from public.booking_reservation_vouchers where booking_id=$1',[b.id]);
    assert.ok(v.collection_order_id);checks++;
    const fee=await one('select * from public.orders where id=$1',[v.collection_order_id]);
    assert.equal(Number(fee.total),1000);assert.equal(fee.payment_method,'QRPH');checks+=2;
    assert.ok(fee.receipt_number && fee.receipt_sequence>0);checks++;
    assert.equal(fee.cashier_id,actor.id);assert.equal(fee.store_id,store);checks+=2;
    assert.equal((await one('select count(*)::int n from public.order_items where order_id=$1',[fee.id])).n,1);checks++;
    await query("update public.function_room_bookings set payment_status='approved' where id=$1",[b.id]);
    const retry=(await one('select public.ensure_booking_reservation_receipt($1) v',[b.id])).v;
    assert.equal(retry.collection_order_id,fee.id);checks++;
    await reject("update public.orders set status='refunded' where id=$1",[fee.id],/cancellation/);
    const key=randomUUID();
    const order={receipt_number:'TEST-'+randomUUID(),order_number:'TEST',store_id:store,total:5000,net_amount:5000,gross_amount:5000,discount_amount:0,subtotal:5000,discount:0,
      items:[{name:'Final bill',quantity:1,unitPrice:5000}],payment_method:'Reservation Fee Applied 1000 + Cash 4000',
      source_metadata:{payment_splits:[{method:'Reservation Fee Applied',amount:1000},{method:'Cash',amount:4000}]}};
    const items=[{source_metadata:{},name:'Final bill',quantity:1,unit_price:5000,line_total:5000,gross_amount:5000,discount_amount:0,net_amount:5000}];
    const saleArgs=[key,b.id,JSON.stringify(order),JSON.stringify(items)];
    const saleSql='select public.complete_pos_booking_sale($1,$2,$3::jsonb,$4::jsonb) sale';
    const final=(await one(saleSql,saleArgs)).sale.order;
    assert.equal(Number(final.total),4000);assert.equal(Number(final.net_amount),4000);checks+=2;
    assert.equal(Number(final.source_metadata.reservation_bill_total),5000);checks++;
    assert.equal(final.source_metadata.reservation_collection_order_id,fee.id);checks++;
    assert.deepEqual(final.source_metadata.payment_splits,[{method:'Cash',amount:4000}]);checks++;
    assert.equal(Number(fee.net_amount)+Number(final.net_amount),5000);checks++;
    assert.equal(Number((await one('select sum(net_amount) n from public.order_items where order_id=$1',[final.id])).n),4000);checks++;
    assert.equal((await one(saleSql,saleArgs)).sale.order.id,final.id);checks++;
    await reject(saleSql,[randomUUID(),...saleArgs.slice(1)],/already/);
    await reject("update public.function_room_bookings set status='cancelled' where id=$1",[b.id],/settled/);
    const listed=(await one('select public.list_pos_confirmed_bookings($1) rows',[store])).rows;
    assert.ok(!listed.some(row=>row.id===b.id));checks++;
    await query('savepoint close_case');
    const close='test-close-'+randomUUID();
    const summary={cashPayments:4000,expectedCash:4000,netSales:5000,grossSales:5000,payments:{Cash:4000,QRPH:1000},reservationFeeCollected:1000,
      reservationCashCollected:0,reservationCashAdjustment:0,reservationCollectionPayments:{Cash:0,Card:0,QRPH:0}};
    await query("insert into public.cashier_pos(id,store_id,cashier_id,mode,cash_total,sales_summary,created_at) values($1,$2,$3,'close',4000,$4,clock_timestamp())",[close,store,actor.id,summary]);
    const closed=await one('select * from public.cashier_pos where id=$1',[close]);
    assert.equal(Number(closed.sales_summary.expectedCash),4000);assert.equal(Number(closed.sales_summary.payments.QRPH),1000);checks+=2;
    await query('select public.finance_capture_closed_shift($1::jsonb,$2::jsonb)',[JSON.stringify({...closed,_finance_refresh:true}),JSON.stringify([fee,final])]);
    const finance=await one('select cash_sales,payments from public.finance_cash_closed_shifts where id=$1',[close]);
    assert.equal(Number(finance.cash_sales),4000);assert.equal(Number(finance.payments.QRPH),1000);checks+=2;
    const unapproved=await seed();
    await reject("update public.function_room_bookings set status='confirmed',payment_status='approved' where id=$1",[unapproved.id],/Open/);
    assert.equal((await one('select status from public.function_room_bookings where id=$1',[unapproved.id])).status,'pending');checks++;
    await query('rollback to savepoint close_case');
    const cash=await seed({status:'confirmed',payment_status:'cash_pending',payment_method:'Cash'});
    const collected=(await one('select public.collect_booking_reservation_fee($1,$2,$3) v',[cash.id,store,'Cash'])).v;
    assert.ok(collected.collection_order_id);checks++;
    assert.equal((await one('select public.collect_booking_reservation_fee($1,$2,$3) v',[cash.id,store,'Cash'])).v.collection_order_id,collected.collection_order_id);checks++;
    const waived=await seed({status:'confirmed',payment_status:'approved',payment_method:'Waived',deposit_amount:0});
    assert.equal((await one('select count(*)::int n from public.booking_reservation_vouchers where booking_id=$1',[waived.id])).n,0);checks++;
    const zeroOrder={...order,receipt_number:'TEST-'+randomUUID(),total:1000,net_amount:1000,gross_amount:1000,subtotal:1000,items:[{name:'Full credit',quantity:1,unitPrice:1000}],
      source_metadata:{payment_splits:[{method:'Reservation Fee Applied',amount:1000}]}};
    const zeroItems=[{...items[0],unit_price:1000,gross_amount:1000,net_amount:1000,line_total:1000}];
    const zero=(await one(saleSql,[randomUUID(),cash.id,JSON.stringify(zeroOrder),JSON.stringify(zeroItems)])).sale.order;
    assert.equal(Number(zero.total),0);assert.equal(Number(zero.source_metadata.reservation_bill_total),1000);checks+=2;
    const bothSummary={cashPayments:5000,expectedCash:5000,netSales:6000,grossSales:6000,payments:{Cash:5000,QRPH:1000},reservationFeeCollected:2000,
      reservationCashCollected:1000,reservationCashAdjustment:0,reservationCollectionPayments:{Cash:0,Card:0,QRPH:0}};
    const finalClose='test-final-close-'+randomUUID();
    await query("insert into public.cashier_pos(id,store_id,cashier_id,mode,cash_total,sales_summary,created_at) values($1,$2,$3,'close',5000,$4,clock_timestamp())",[finalClose,store,actor.id,bothSummary]);
    const finalSummary=(await one('select sales_summary from public.cashier_pos where id=$1',[finalClose])).sales_summary;
    assert.equal(Number(finalSummary.expectedCash),5000);assert.equal(Number(finalSummary.cashPayments),5000);checks+=2;
    await query("insert into public.cashier_pos(id,store_id,cashier_id,mode,cash_total,created_at) values($1,$2,$3,'open',0,clock_timestamp())",['test-gc-open-'+randomUUID(),store,actor.id]);
    const cancelled=await seed({status:'confirmed',payment_status:'approved',payment_method:'Cash'});
    await query("update public.function_room_bookings set status='cancellation_requested' where id=$1",[cancelled.id]);
    const batch=await one('select id from public.booking_gc_batches where booking_id=$1',[cancelled.id]);
    const admin=await one("select id from public.profiles where lower(role) in ('admin','super_admin') limit 1");
    await query('select public.approve_booking_gc_batch($1,$2)',[batch.id,admin.id]);
    const cert=await one("select code from public.booking_gc_certificates where batch_id=$1 and status='active' order by sequence_number limit 1",[batch.id]);
    const gcOrder={...order,receipt_number:'TEST-'+randomUUID(),total:500,net_amount:500,gross_amount:500,subtotal:500,items:[{name:'GC bill',quantity:1,unitPrice:500}],
      source_metadata:{payment_splits:[{method:'JUJA e-GC',amount:100},{method:'Cash',amount:400}]}};
    const gcItems=[{...items[0],unit_price:500,gross_amount:500,net_amount:500,line_total:500}];
    const gc=(await one('select public.complete_pos_gc_sale($1,$2::jsonb,$3::jsonb,$4::text[]) sale',[randomUUID(),JSON.stringify(gcOrder),JSON.stringify(gcItems),[cert.code]])).sale.order;
    assert.equal(Number(gc.net_amount),400);assert.equal(Number(gc.source_metadata.reservation_bill_total),500);checks+=2;
    assert.equal(Number((await one('select sum(net_amount) n from public.order_items where order_id=$1',[gc.id])).n),400);checks++;
    if(process.argv.includes('--no-booking-loyalty')) {
      const member=(await one('select to_jsonb(m) member from public.loyalty_members m limit 1')).member;assert.ok(member);
      for(const receipt of [fee,final]) {
        const result=(await one('select to_jsonb(public.award_loyalty_points_for_order($1,$2,40,1000)) member',[receipt.id,member.id])).member;
        assert.deepEqual(result,member);checks++;
        assert.equal((await one("select count(*)::int n from public.loyalty_point_award_events where source_type='order' and source_id=$1",[receipt.id])).n,0);checks++;
      }
      assert.equal((await one('select source_metadata from public.orders where id=$1',[final.id])).source_metadata.exclude_loyalty,true);checks++;
      await reject('update public.orders set loyalty_points_awarded=40 where id=$1',[final.id],/VIP booking|booking/i);
      assert.equal((await one("select public.booking_order_excludes_loyalty(jsonb_populate_record(null::public.orders,'{\"dining_option\":\"Dine In\",\"source_metadata\":{}}')) excluded")).excluded,false);checks++;
    }
    await query('set constraints all immediate');
    console.log(`Booking approval/normal receipt verification passed (${checks} assertions); all fixture writes rolled back.`);
  }finally{await query('rollback');await db.end();}
}
main().catch(e=>{console.error(e.message,e.where||'');process.exitCode=1;});
