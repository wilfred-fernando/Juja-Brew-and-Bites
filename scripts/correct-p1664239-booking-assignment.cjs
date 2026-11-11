const { loadEnvConfig } = require('@next/env');
const { Client } = require('pg');
const assert = require('node:assert/strict');
loadEnvConfig(process.cwd());

// User-confirmed correction: P1664239 belongs to Jessica's October 31 booking.
// Default execution rehearses and rolls back. --apply commits only this case.
(async()=>{
 const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
 await db.connect();
 const order='c5501dab-c08c-4043-800c-4be08c080d30';
 const from='faea2d6d-d4c3-4edc-9ae4-3092513a60aa',to='89f602e6-a926-40c7-b7eb-18e03c6f5e0f';
 const key='P1664239-Arlyn-to-Jessica-20261108';
 const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const snapshot=async()=>({
   order:(await rows('select to_jsonb(o) data from orders o where id=$1',[order]))[0].data,
   bookings:(await rows('select to_jsonb(b) data from function_room_bookings b where id=any($1::uuid[]) order by id',[[from,to]])).map(r=>r.data),
   vouchers:(await rows('select to_jsonb(v) data from booking_reservation_vouchers v where booking_id=any($1::uuid[]) order by booking_id',[[from,to]])).map(r=>r.data),
   settlements:(await rows('select to_jsonb(s) data from booking_pos_settlements s where booking_id=any($1::uuid[]) or order_id=$2 order by booking_id',[[from,to],order])).map(r=>r.data),
 });
 try{
  await db.query('BEGIN');
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='30s'");
  await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[key]);
  await db.query(`create table if not exists public.pos_booking_assignment_corrections(
   correction_key text primary key,order_id uuid not null references public.orders(id),
   from_booking_id uuid not null references public.function_room_bookings(id),
   to_booking_id uuid not null references public.function_room_bookings(id),
   reason text not null,before_data jsonb not null,after_data jsonb not null,
   corrected_at timestamptz not null default now(),database_actor text not null default session_user)`);
  await db.query('alter table public.pos_booking_assignment_corrections enable row level security');
  await db.query('revoke all on public.pos_booking_assignment_corrections from public,anon,authenticated');
  await db.query('grant all on public.pos_booking_assignment_corrections to service_role');
  const prior=await rows('select correction_key from pos_booking_assignment_corrections where correction_key=$1',[key]);
  if(prior.length){
   const current=await snapshot();
   assert.equal(current.order.source_metadata.booking_id,to);
   assert.equal(current.vouchers.find(v=>v.booking_id===from).redeemed_order_id,null);
   assert.equal(current.vouchers.find(v=>v.booking_id===to).redeemed_order_id,order);
   await db.query('ROLLBACK');console.log('Already corrected; no changes made.');return;
  }
  await db.query('select id from function_room_bookings where id=any($1::uuid[]) order by id for update',[[from,to]]);
  await db.query('select id from orders where id=$1 for update',[order]);
  await db.query('select booking_id from booking_reservation_vouchers where booking_id=any($1::uuid[]) order by booking_id for update',[[from,to]]);
  await db.query('select booking_id from booking_pos_settlements where booking_id=any($1::uuid[]) order by booking_id for update',[[from,to]]);
  const before=await snapshot(),sale=before.order;
  assert.equal(sale.receipt_number,'P1664239');assert.equal(sale.status,'paid');
  assert.equal(sale.source_metadata.booking_id,from);
  assert.equal(before.bookings.find(b=>b.id===from).customer_name,'Arlyn Castillo');
  assert.equal(before.bookings.find(b=>b.id===to).customer_name,'Jessica Paula Flores');
  const oldVoucher=before.vouchers.find(v=>v.booking_id===from),newVoucher=before.vouchers.find(v=>v.booking_id===to);
  assert.equal(oldVoucher.redeemed_order_id,order);assert.equal(newVoucher.redeemed_order_id,null);
  assert.equal(Number(oldVoucher.amount),1000);assert.equal(Number(newVoucher.amount),1000);
  assert.equal(newVoucher.store_id,sale.store_id);assert.equal(oldVoucher.store_id,sale.store_id);
  assert.equal(before.settlements.length,1);assert.equal(before.settlements[0].booking_id,from);
  const collectionIds=before.vouchers.map(v=>v.collection_order_id).filter(Boolean);
  const collections=await rows('select to_jsonb(o) data from orders o where id=any($1::uuid[]) order by id',[collectionIds]);
  // Jessica's duplicate collection was already reversed with no cash payout.
  // Preserve that correction; her approved prepaid credit is reassigned only.
  const reversed=collections.find(r=>r.data.id===newVoucher.collection_order_id).data;
  assert.equal(reversed.status,'voided');assert.equal(reversed.source_metadata.reservation_fee_collection_reversed,true);
  assert.equal(before.bookings.find(b=>b.id===to).payment_status,'approved');
  const shifts=await rows('select id,cash_total,sales_summary from cashier_pos where store_id=$1 order by id',[sale.store_id]);
  const items=await rows('select to_jsonb(i) data from order_items i where order_id=$1 order by id',[order]);
  const definitions=[];
  for(const name of ['protect_booking_reservation_credit','protect_reservation_collection_receipt']){
   definitions.push({name,sql:(await rows('select pg_get_functiondef(($1||\'()\')::regprocedure) definition',['public.'+name]))[0].definition});
  }
  const expected={...sale,customer_name:'Jessica Paula Flores',
   dining_option:`VIP Booking ${to}`,order_type:`VIP Booking ${to}`,
   source_metadata:{...sale.source_metadata,booking_id:to,reservation_booking_name:'Jessica Paula Flores',
    reservation_voucher_code:newVoucher.code,reservation_collection_order_id:newVoucher.collection_order_id}};
  const literal=async value=>(await rows("select quote_literal($1::jsonb) value",[JSON.stringify(value)]))[0].value;
  const oldLiteral=await literal(sale),newLiteral=await literal(expected);
  // Inside this transaction only, permit exactly the reviewed before/after row.
  // All unrelated updates retain the original guard. Restore its exact original
  // definition before commit, so no relaxed guard becomes visible externally.
  const exception=`\n if tg_table_name='orders' and tg_op='UPDATE' and old.id='${order}'::uuid
   and to_jsonb(old)=${oldLiteral}::jsonb
   and (to_jsonb(new)-'updated_at')=(${newLiteral}::jsonb-'updated_at') then
   if not exists(select 1 from public.booking_pos_settlements where booking_id='${to}'::uuid and order_id=new.id)
    or not exists(select 1 from public.booking_reservation_vouchers where booking_id='${to}'::uuid and redeemed_order_id=new.id and amount=1000)
    then raise exception 'Corrected booking ledger is missing'; end if;
   return new;
 end if;\n`;
  for(const definition of definitions){
   assert.ok(definition.sql.includes('\nbegin\n'));
   await db.query(definition.sql.replace('\nbegin\n','\nbegin\n'+exception));
  }
  await db.query('update booking_reservation_vouchers set redeemed_order_id=null,redeemed_at=null where booking_id=$1',[from]);
  await db.query('update booking_reservation_vouchers set redeemed_order_id=$1,redeemed_at=$2 where booking_id=$3',[order,oldVoucher.redeemed_at,to]);
  await db.query('update booking_pos_settlements set booking_id=$1 where booking_id=$2 and order_id=$3',[to,from,order]);
  await db.query('update orders set customer_name=$1,dining_option=$2,order_type=$2,source_metadata=$3 where id=$4',
   [expected.customer_name,expected.dining_option,expected.source_metadata,order]);
  for(const definition of definitions){
   await db.query(definition.sql);
   assert.equal((await rows('select pg_get_functiondef(($1||\'()\')::regprocedure) definition',['public.'+definition.name]))[0].definition,definition.sql);
  }
  const after=await snapshot();
  assert.deepEqual(after.bookings,before.bookings);
  const financial=value=>{const {customer_name,dining_option,order_type,source_metadata,updated_at,...unchanged}=value;return unchanged;};
  assert.deepEqual(financial(after.order),financial(sale));
  assert.deepEqual(after.order.source_metadata,expected.source_metadata);
  for(const old of before.vouchers){
   const current=after.vouchers.find(v=>v.booking_id===old.booking_id);
   const {redeemed_order_id:a,redeemed_at:b,...left}=old;
   const {redeemed_order_id:c,redeemed_at:e,...right}=current;
   assert.deepEqual(right,left);
  }
  assert.equal(after.vouchers.find(v=>v.booking_id===from).redeemed_order_id,null);
  assert.equal(after.vouchers.find(v=>v.booking_id===to).redeemed_order_id,order);
  assert.deepEqual(after.settlements,[{...before.settlements[0],booking_id:to}]);
  assert.deepEqual(await rows('select to_jsonb(o) data from orders o where id=any($1::uuid[]) order by id',[collectionIds]),collections);
  assert.deepEqual(await rows('select id,cash_total,sales_summary from cashier_pos where store_id=$1 order by id',[sale.store_id]),shifts);
  assert.deepEqual(await rows('select to_jsonb(i) data from order_items i where order_id=$1 order by id',[order]),items);
  await db.query('insert into pos_booking_assignment_corrections(correction_key,order_id,from_booking_id,to_booking_id,reason,before_data,after_data) values($1,$2,$3,$4,$5,$6,$7)',
   [key,order,from,to,'User confirmed October 31 receipt P1664239 was mistakenly tagged to Arlyn Castillo; correct booking is Jessica Paula Flores.',before,after]);
  await db.query('SET CONSTRAINTS ALL IMMEDIATE');
  await db.query(process.argv.includes('--apply')?'COMMIT':'ROLLBACK');
  console.log(JSON.stringify({applied:process.argv.includes('--apply'),receipt:'P1664239',correctBooking:'Jessica Paula Flores',arlynCreditAvailable:1000,
   cashCollectedUnchanged:sale.total,collectionReceiptsUnchanged:true,shiftSummariesUnchanged:true,itemsUnchanged:true,originalGuardRestored:true}));
 }catch(error){await db.query('ROLLBACK');throw error;}finally{await db.end();}
})().catch(error=>{console.error(error.message,error.where||'');process.exitCode=1;});
