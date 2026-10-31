require('@next/env').loadEnvConfig(process.cwd());
const {Client}=require('pg');const assert=require('node:assert/strict');
const store='bcfa9d8f-f2e5-4573-b3e3-635901ec7a4e';
const start='2026-10-30T00:00:00+08:00';
(async()=>{const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});await db.connect();
const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
try{await db.query('begin');await db.query("set local lock_timeout='5s'");
const admin=await one("select id from profiles where lower(role) in ('admin','super_admin') limit 1");
await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[admin.id,JSON.stringify({sub:admin.id,role:'authenticated'})]);
const fingerprint=async()=>one("select md5(coalesce(string_agg(md5(to_jsonb(o)::text),'' order by id),'')) hash from orders o");
const beforeOrders=await fingerprint();
const beforeStock=new Map((await db.query('select id,current_stock from inventory_items')).rows.map(r=>[r.id,Number(r.current_stock)]));
await db.query(`create temporary table cup_consumption_plan on commit drop as
select o.id order_id,o.created_at sale_at,i.id item_id,c.id common_id,c.common_name,i.unit,
 sum((line->>'quantity')::numeric) quantity
from orders o cross join lateral jsonb_array_elements(o.items) line
left join menu_items m on m.id::text=coalesce(line->>'menu_item_id',line->>'menuItemId',line->>'id')
join menu_item_ingredients r on r.menu_item_id='category:'||coalesce(nullif(line->>'category',''),m.category)
 and r.variant_key=inventory_drink_cup_size(line) and r.is_active is not false
join common_inventory_names c on c.id=r.common_name_id
join inventory_items i on i.common_name_id=c.id and i.is_active is true
where coalesce(o.store_id,o.branch_id)=$1 and o.created_at >=$2::timestamptz
 and inventory_uses_disposable_cups(o.dining_option,o.order_type)
 and o.status in ('paid','completed') and o.voided_at is null and o.refunded_at is null
 and coalesce((line->>'quantity')::numeric,0)>0
 and c.common_name in ('Slim Cup - 16oz','Slim Cup - 22oz','Pet Cup - 16oz','Pet Cup - 20oz','Hot Cup 12oz')
group by o.id,o.created_at,i.id,c.id,c.common_name,i.unit`,[store,start]);
const plan=(await db.query('select * from cup_consumption_plan order by order_id,item_id')).rows;
assert(plan.length>0);
const changed=new Map();
await db.query(`create temporary table cup_backfill_changes(item_id uuid,qty numeric) on commit drop`);
await db.query(`do $$
declare p record; old_qty numeric; missing numeric; tx public.inventory_transactions;
begin
 for p in select * from cup_consumption_plan order by order_id,item_id loop
  perform pg_advisory_xact_lock(hashtext('inventory-pos-order-'||p.order_id::text));
  perform 1 from orders where id=p.order_id for update;
  if p.unit<>'pc' then raise exception 'Cup unit must be pc'; end if;
  select coalesce(sum(-quantity_effect),0) into old_qty from inventory_transactions
   where reference_type='pos_order' and reference_id=p.order_id::text and inventory_item_id=p.item_id and transaction_type='pos_deduction';
  missing:=p.quantity-old_qty;
  if missing<0 then raise exception 'Existing consumption exceeds sales'; end if;
  if missing=0 then continue; end if;
  tx:=add_inventory_transaction(p.item_id,p.common_id,'pos_deduction',missing,p.unit,-missing,
   'pos_order',p.order_id::text,'Cup consumption backfill from recorded sales, since 2026-10-30',auth.uid());
  update inventory_transactions set created_at=p.sale_at where id=tx.id;
  update stock_movements set created_at=p.sale_at where inventory_item_id=p.item_id and source_type='pos_order'
   and source_id=p.order_id::text and notes=tx.notes and created_at=tx.created_at;
  insert into cup_backfill_changes values(p.item_id,missing);
 end loop;
end $$`);
const newTransactions=(await one('select count(*)::int n from cup_backfill_changes')).n;
for(const r of (await db.query('select item_id,sum(qty) qty from cup_backfill_changes group by item_id')).rows)changed.set(r.item_id,Number(r.qty));
// Reconciliation also proves a repeated run has no missing units.
const mismatch=await one(`select count(*)::int n from cup_consumption_plan p where p.quantity<>(select coalesce(sum(-t.quantity_effect),0) from inventory_transactions t where t.reference_type='pos_order' and t.reference_id=p.order_id::text and t.inventory_item_id=p.item_id and t.transaction_type='pos_deduction')`);assert.equal(mismatch.n,0);
assert.deepEqual(await fingerprint(),beforeOrders);
for(const r of (await db.query('select id,current_stock from inventory_items')).rows)assert.equal(Number(r.current_stock),beforeStock.get(r.id)-(changed.get(r.id)||0));
const summary=(await db.query('select common_name,sum(quantity)::int consumed from cup_consumption_plan group by common_name order by common_name')).rows;
const stocks=(await db.query('select distinct i.common_name,i.current_stock from inventory_items i join cup_consumption_plan p on p.item_id=i.id order by i.common_name')).rows;
await db.query('set constraints all immediate');
if(process.argv.includes('--apply'))await db.query('commit');else await db.query('rollback');
console.log(JSON.stringify({mode:process.argv.includes('--apply')?'APPLIED':'ROLLBACK VERIFIED',store:'Pasong Tamo',since:'2026-10-30',orders:new Set(plan.map(p=>p.order_id)).size,newTransactions,summary,stocks,receiptDataUnchanged:true,otherStockUnchanged:true,repeatedRunMissingUnits:0}));
}catch(e){await db.query('rollback');throw e;}finally{await db.end()}})().catch(e=>{console.error(e.message,e.where||'');process.exitCode=1});


