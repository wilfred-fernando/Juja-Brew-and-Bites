const {loadEnvConfig}=require('@next/env');
const {Client}=require('pg');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
loadEnvConfig(process.cwd());

(async()=>{
 const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});await db.connect();
 const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const one=async(sql,args=[])=>(await rows(sql,args))[0];
 const rejects=async(fn,pattern)=>{await db.query('savepoint invalid_case');await assert.rejects(fn,pattern);await db.query('rollback to savepoint invalid_case');};
 try{
  await db.query('begin');await db.query("set local statement_timeout='30s'");await db.query("set local lock_timeout='5s'");
  if(!(await one("select to_regprocedure('public.change_pos_charged_dining_option(uuid,uuid,uuid,text,text,timestamptz)') installed")).installed){
   await db.query(fs.readFileSync('supabase/migrations/20261111090000_charged_receipt_dining_option.sql','utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,''));
  }
  const actor=await one("select id,store_id from profiles where lower(role)='cashier' and store_id::text='bcfa9d8f-f2e5-4573-b3e3-635901ec7a4e' limit 1");
  assert.ok(actor);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor.id]);
  const options=await rows('select * from pos_dining_options where store_id=$1 and is_active',[actor.store_id]);
  const table=options.find(o=>/^TABLE 1$/i.test(o.name)),takeout=options.find(o=>/^TAKEOUT$/i.test(o.name)),vip=options.find(o=>/^VIP ROOM$/i.test(o.name));
  assert.ok(table&&takeout&&vip);
  const menus=await rows("select distinct on(category) id,name,category from menu_items where category in ('MILK TEA (CLASSIC)','LATTE (COFFEE)') order by category,id");
  assert.equal(menus.length,2);
  const latte=menus.find(m=>m.category==='LATTE (COFFEE)'),milk=menus.find(m=>m.category==='MILK TEA (CLASSIC)');
  const lines=[{...milk,quantity:1,selectedOptions:[{groupName:'Variant',name:'Regular'}]},
    {...latte,quantity:1,selectedOptions:[{groupName:'Variant',name:'Large'}]},
    {...latte,quantity:1,selectedOptions:[{groupName:'Variant',name:'Hot (R)'}]}];
  const id=randomUUID(),parent=randomUUID();
  const create=await one("insert into orders(id,receipt_number,order_number,store_id,branch_id,status,items,total,net_amount,gross_amount,discount_amount,discount,paid_at,cashier_id,payment_method,dining_option,order_type,inventory_deducted,source_metadata) values($1,$2,$2,$3,$3,'paid',$4,'300',300,300,0,'0',now(),$5,'Cash',$6,$6,true,$7) returning *",
    [id,'TEST-DINING-'+randomUUID(),actor.store_id,JSON.stringify(lines),actor.id,table.name,{open_ticket_id:parent,payment_splits:[{method:'Cash',amount:300}]}]);
  const baseline=await rows("select id,current_stock from inventory_items where common_name in ('Slim Cup - 16oz','Slim Cup - 22oz','Pet Cup - 16oz','Pet Cup - 20oz','Hot Cup 12oz') order by id");
  const ingredient=await one("select id,common_name_id,unit,current_stock from inventory_items where is_active and coalesce(common_name,'') not in ('Slim Cup - 16oz','Slim Cup - 22oz','Pet Cup - 16oz','Pet Cup - 20oz','Hot Cup 12oz') order by id limit 1");
  assert.ok(ingredient);
  await db.query("select add_inventory_transaction($1,$2,'pos_deduction',2,$3,-2,'pos_order',$4,'Rollback test ingredient',$5)",[ingredient.id,ingredient.common_name_id,ingredient.unit,id,actor.id]);
  await db.query("insert into kds_tickets(source_type,source_id,store_id,order_id,dining_option,items,status) values('pos',$1,$2,$3,$4,$5,'preparing'),('pos',$6,$2,$3,$4,$5,'ready')",
    [parent,actor.store_id,id,table.name,JSON.stringify([{id:'kitchen',name:'Test pending food',quantity:2,kitchenReady:false}]),parent+':batch:'+randomUUID()]);
  const cards=()=>rows("select to_jsonb(k)-'dining_option'-'fulfillment_type'-'updated_at' data from kds_tickets k where order_id=$1 order by id",[id]);
  const originalCards=await cards();
  const reload=()=>one('select *,updated_at::text version from orders where id=$1',[id]);
  const current=()=>rows("select id,current_stock from inventory_items where common_name in ('Slim Cup - 16oz','Slim Cup - 22oz','Pet Cup - 16oz','Pet Cup - 20oz','Hot Cup 12oz') order by id");
  const call=async(option,key=randomUUID(),version=null,reason='Correct serving destination')=>{
    const sale=await reload();return (await one('select change_pos_charged_dining_option($1,$2,$3,$4,$5,$6) result',[key,id,option.id,'',reason,version||sale.version])).result;
  };
  await rejects(()=>call(takeout,randomUUID(),new Date('2000-01-01Z')),/Receipt changed/);
  const other=await one('select id from pos_dining_options where store_id<>$1 and is_active limit 1',[actor.store_id]);
  await rejects(()=>call(other),/active dining option/);
  const foreignReceipt=await one('select id,updated_at::text version from orders where store_id<>$1 and updated_at is not null limit 1',[String(actor.store_id)]);
  if(foreignReceipt)await rejects(()=>db.query("select change_pos_charged_dining_option($1,$2,$3,'','Reject foreign branch receipt',$4)",[randomUUID(),foreignReceipt.id,takeout.id,foreignReceipt.version]),/not available in your branch/);
  const customer=await one("select id from profiles where lower(role) not in ('cashier','admin','super_admin') limit 1");
  if(customer){
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[customer.id]);
    await rejects(()=>call(takeout),/POS staff access/);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor.id]);
  }
  await db.query("alter table pos_charged_dining_changes add constraint rollback_dining_test check(reason<>'FORCE TEST FAIL')");
  await rejects(()=>call(takeout,randomUUID(),null,'FORCE TEST FAIL'),/rollback_dining_test/);
  assert.deepEqual(await current(),baseline,'Failed correction must not consume cups');
  const key=randomUUID(),result=await call(takeout,key);
  assert.equal(result.cup_movements.reduce((sum,m)=>sum-Number(m.quantity_effect),0),3);
  const cupNames=(await rows("select c.common_name,sum(-t.quantity_effect)::int n from inventory_transactions t join common_inventory_names c on c.id=t.common_name_id where t.reference_id=$1 and t.transaction_type='correction' group by c.common_name",[id])).map(r=>r.common_name).sort();
  assert.deepEqual(cupNames,['Hot Cup 12oz','Pet Cup - 20oz','Slim Cup - 16oz']);
  const count=(await one('select count(*)::int n from inventory_transactions where reference_id=$1',[id])).n;
  assert.equal((await call(takeout,key)).replayed,true);
  await call(takeout);
  assert.equal((await one('select count(*)::int n from inventory_transactions where reference_id=$1',[id])).n,count,'Retries/same cup policy cannot deduct twice');
  await call(vip);assert.deepEqual(await current(),baseline,'VIP returns disposable cups');
  assert.equal(Number((await one('select current_stock from inventory_items where id=$1',[ingredient.id])).current_stock),Number(ingredient.current_stock)-2,'Ingredients are not re-deducted or restored by dining changes');
  await call(takeout);await call(table);assert.deepEqual(await current(),baseline,'Repeated transitions have zero cup drift');
  assert.deepEqual(await cards(),originalCards,'KDS item progress and identities must remain unchanged');
  const final=await reload();
  for(const field of ['total','net_amount','gross_amount','discount_amount','payment_method','paid_at','loyalty_points_awarded','source_metadata','items'])assert.deepEqual(final[field],create[field],field+' changed');
  await db.query('savepoint refundable_disposable');
  await call(takeout);
  await db.query("update orders set status='refunded',refund_amount=300,refunded_at=now() where id=$1",[id]);
  await db.query('select restore_inventory_for_void_order($1,$2)',[id,actor.id]);
  assert.deepEqual(await current(),baseline,'Refund restores only the net cups still consumed');
  await db.query('rollback to savepoint refundable_disposable');
  // A refund after cups were returned must restore only the ingredient balance.
  await db.query("update orders set status='refunded',refund_amount=300,refunded_at=now() where id=$1",[id]);
  await rejects(()=>call(takeout),/unrefunded/);
  await db.query('select restore_inventory_for_void_order($1,$2)',[id,actor.id]);
  assert.deepEqual(await current(),baseline,'Refund must not return cups a second time');
  assert.equal(Number((await one('select current_stock from inventory_items where id=$1',[ingredient.id])).current_stock),Number(ingredient.current_stock));
  assert.equal((await one('select restore_inventory_for_void_order($1,$2) result',[id,actor.id])).result.duplicate,true);
  const protectedSale=await one("select *,updated_at::text version from orders where store_id=$1 and status='paid' and source_metadata ? 'booking_id' limit 1",[actor.store_id]);
  if(protectedSale)await rejects(()=>db.query('select change_pos_charged_dining_option($1,$2,$3,\'\',\'Do not alter booking credit\',$4)',[randomUUID(),protectedSale.id,takeout.id,protectedSale.version]),/booking-assignment/);
  assert.equal((await one("select has_function_privilege('anon','public.change_pos_charged_dining_option(uuid,uuid,uuid,text,text,timestamptz)','execute') allowed")).allowed,false);
  assert.equal((await one("select has_table_privilege('authenticated','public.pos_charged_dining_changes','insert') allowed")).allowed,false);
  await db.query('SET CONSTRAINTS ALL IMMEDIATE');
  console.log('PASS: charged dining correction, regular/large/hot cup recipes, rollback, stale/cross-branch guards, retries, repeated transitions, VIP reusable cups, ingredient preservation, KDS progress, financial fields, booking protection, and refund without double-restocking. All test records rolled back.');
 }finally{await db.query('ROLLBACK');await db.end();}
})().catch(error=>{console.error(error.message,error.where||'');process.exitCode=1;});
