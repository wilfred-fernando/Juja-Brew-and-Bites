require('@next/env').loadEnvConfig(process.cwd());const {Client}=require('pg'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});await db.connect();
const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
try{await db.query('begin');await db.query("set local lock_timeout='5s'");
await db.query(fs.readFileSync('supabase/migrations/20261031110000_disposable_cup_dining_policy.sql','utf8').replace(/^begin;$/m,'').replace(/^commit;$/m,''));
const actor=await one("select id from profiles where lower(role) in ('admin','super_admin') limit 1");await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor.id]);
const ordersHash=async()=>one("select md5(string_agg(md5(to_jsonb(o)::text),'' order by id)) hash from orders o");const beforeOrders=await ordersHash();
await db.query(`create temporary table incorrect_cup_backfills on commit drop as
 select t.* from inventory_transactions t join orders o on o.id::text=t.reference_id
 where t.transaction_type='pos_deduction' and t.reference_type='pos_order'
 and t.notes='Cup consumption backfill from recorded sales, since 2026-10-30'
 and coalesce(o.store_id,o.branch_id)='bcfa9d8f-f2e5-4573-b3e3-635901ec7a4e'
 and not inventory_uses_disposable_cups(o.dining_option,o.order_type)`);
const beforeStock=new Map((await db.query('select id,current_stock from inventory_items')).rows.map(r=>[r.id,Number(r.current_stock)]));
const preservedHash=async()=>one("select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by id),'')) hash from inventory_transactions t where id not in(select id from incorrect_cup_backfills)");const beforePreserved=await preservedHash();
const removed=(await db.query('select * from incorrect_cup_backfills order by id')).rows;
const changes=(await db.query('select inventory_item_id,sum(-quantity_effect) qty from incorrect_cup_backfills group by inventory_item_id')).rows;
const expected=new Map(beforeStock);for(const row of changes)expected.set(row.inventory_item_id,expected.get(row.inventory_item_id)+Number(row.qty));
// Undo only the erroneous backfill movements created by this chat. Retain an audit export.
const mirrors=(await db.query(`select s.* from stock_movements s join incorrect_cup_backfills t
 on s.inventory_item_id=t.inventory_item_id and s.source_type=t.reference_type and s.source_id=t.reference_id
 and s.notes=t.notes and s.created_at=t.created_at and s.quantity=t.quantity_effect`)).rows;
assert.equal(mirrors.length,removed.length,'Each erroneous deduction must have exactly one matching stock movement');
if(process.argv.includes('--apply') && removed.length){fs.mkdirSync('tmp',{recursive:true});fs.writeFileSync('tmp/reversed-dine-in-vip-cup-backfills.json',JSON.stringify({reason:'Dine-in/VIP use reusable cups',inventoryTransactions:removed,stockMovements:mirrors},null,2));}
await db.query('delete from stock_movements where id=any($1)',[mirrors.map(r=>r.id)]);
await db.query('delete from inventory_transactions where id in(select id from incorrect_cup_backfills)');
await db.query(`update inventory_items i set current_stock=i.current_stock+c.qty,updated_at=now()
 from(select inventory_item_id,sum(-quantity_effect) qty from incorrect_cup_backfills group by inventory_item_id)c where i.id=c.inventory_item_id`);
assert.deepEqual(await ordersHash(),beforeOrders);assert.deepEqual(await preservedHash(),beforePreserved);
for(const r of (await db.query('select id,current_stock from inventory_items')).rows)assert.equal(Number(r.current_stock),expected.get(r.id));
const summary=(await db.query(`select c.common_name,coalesce(sum(-t.quantity_effect),0)::int consumed,i.current_stock remaining
 from inventory_items i join common_inventory_names c on c.id=i.common_name_id
 left join inventory_transactions t on t.inventory_item_id=i.id and t.transaction_type='pos_deduction'
 where c.common_name in('Slim Cup - 16oz','Slim Cup - 22oz','Pet Cup - 16oz','Pet Cup - 20oz','Hot Cup 12oz')
 group by c.common_name,i.current_stock order by c.common_name`)).rows;
await db.query('set constraints all immediate');if(process.argv.includes('--apply'))await db.query('commit');else await db.query('rollback');
console.log(JSON.stringify({mode:process.argv.includes('--apply')?'APPLIED':'ROLLBACK VERIFIED',restoredCups:removed.reduce((n,r)=>n-Number(r.quantity_effect),0),removedMovements:removed.length,summary,allReceiptsUnchanged:true,eligibleDeductionsUnchanged:true,otherStockUnchanged:true}));
}catch(e){await db.query('rollback');throw e;}finally{await db.end()}})().catch(e=>{console.error(e.message,e.where||'');process.exitCode=1});
