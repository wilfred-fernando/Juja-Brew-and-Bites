const {loadEnvConfig}=require('@next/env');loadEnvConfig(process.cwd());
const {Client}=require('pg');const assert=require('node:assert/strict');
const targets=[
 ['exp_60d0e7d5-ca27-4963-9cda-39712f976bfe','Tall Flat Lid 98mm',500,750],
 ['exp_91314d58-67df-4ec2-a664-f808201ff6f6','Strawless Lid 98mm',500,650],
 ['exp_33678373-d0ad-4c76-a260-f30684cd7dc2','JUJA Pet Cup - 20oz',1000,3850],
 ['exp_c3ebccaf-7935-41a5-8558-bf14c17af7cd','JUJA Pet Cup - 16oz',1000,3450],
 ['exp_ccfba240-03a5-45d5-9ca5-571cbeee84a7','JUJA Slim Cup - 16oz',1000,3200],
 ['exp_ec6f8617-cfeb-4f01-83b6-a71445e97c73','JUJA Slim Cup - 22oz',1000,3500],
];
(async()=>{const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});await db.connect();
const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
try{await db.query('begin');await db.query("set local lock_timeout='5s'");
const ids=targets.map(t=>t[0]);
const fingerprint=async()=>one("select md5(coalesce(string_agg(md5(to_jsonb(e)::text),'' order by id),'')) hash from finance_expenses e where not(id=any($1::text[]))",[ids]);
const excludedBefore=await fingerprint();
const stockBefore=new Map((await db.query('select id,current_stock from inventory_items')).rows.map(r=>[r.id,Number(r.current_stock)]));
const admin=await one("select id from profiles where lower(role) in ('admin','super_admin') limit 1");
await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[admin.id,JSON.stringify({sub:admin.id,role:'authenticated'})]);
const expectedStock=new Map(stockBefore);const output=[];
for(const [id,description,quantity,total] of targets){
 const e=await one('select * from finance_expenses where id=$1 for update',[id]);
 assert.equal(e.description,description);assert.equal(Number(e.quantity),quantity);assert.equal(Number(e.total),total);assert.equal(e.unit,'pc');assert.equal(e.petty_cash_entry_id,null);
 assert(['needs_mapping','synced'].includes(e.inventory_sync_status));
 const financialBefore=await one("select to_jsonb(e)-array['inventory_item_id','inventory_sync_status','inventory_synced_at','updated_at'] as data from finance_expenses e where id=$1",[id]);
 const ref=await one("select * from finance_references where ref_type='item' and name=$1 and is_active is not false",[description]);assert(ref);
 await db.query("insert into common_inventory_names(common_name,default_unit,category) values($1,'pc','Packaging') on conflict(common_name) do nothing",[ref.common_name]);
 const common=await one('select id from common_inventory_names where common_name=$1',[ref.common_name]);
 let item=await one('select * from inventory_items where common_name_id=$1 and is_active is true',[common.id]);
 if(!item)item=await one("insert into inventory_items(item_name,common_name,common_name_id,unit,category) values($1,$2,$3,'pc','Packaging') returning *",[description,ref.common_name,common.id]);
 assert.equal(item.unit,'pc');
 const previous=await one('select * from expense_inventory_links where expense_id=$1',[id]);
 assert(!previous||previous.inventory_item_id===item.id);
 const delta=quantity-Number(previous?.purchased_quantity||0);
 expectedStock.set(item.id,(expectedStock.get(item.id)||0)+delta);
 await db.query('update finance_expenses set inventory_item_id=$2 where id=$1',[id,item.id]);
 const sync=async()=> (await one('select sync_expense_to_inventory($1,$2,$3,$4,$5,$6,$7,$8) result',[id,item.id,common.id,e.quantity,e.unit,e.unit_price,e.total,admin.id])).result;
 const result=await sync();assert.equal(result.ok,true);assert.equal(Number(result.delta),delta);
 await db.query('savepoint repeat_sync');assert.equal(Number((await sync()).delta),0);await db.query('rollback to savepoint repeat_sync');
 const after=await one("select to_jsonb(e)-array['inventory_item_id','inventory_sync_status','inventory_synced_at','updated_at'] as data from finance_expenses e where id=$1",[id]);assert.deepEqual(after,financialBefore);
 assert.equal((await one('select inventory_sync_status status from finance_expenses where id=$1',[id])).status,'synced');
 output.push({description,quantity,status:'synced',stockAdded:delta});
}
assert.deepEqual(await fingerprint(),excludedBefore);
for(const item of (await db.query('select id,current_stock from inventory_items')).rows)assert.equal(Number(item.current_stock),expectedStock.get(item.id),`Stock mismatch ${item.id}`);
await db.query('set constraints all immediate');
if(process.argv.includes('--apply'))await db.query('commit');else await db.query('rollback');
console.log(JSON.stringify({mode:process.argv.includes('--apply')?'APPLIED':'ROLLBACK VERIFIED',purchases:output,excludedExpensesUnchanged:true,otherStockUnchanged:true,duplicateSyncAddsZero:true}));
}catch(e){await db.query('rollback');throw e;}finally{await db.end()}})().catch(e=>{console.error(e.message,e.where||'');process.exitCode=1});
