const {loadEnvConfig}=require('@next/env');
const {Client}=require('pg');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
loadEnvConfig(process.cwd());
(async()=>{
 const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});await db.connect();
 const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 const reject=async(fn,pattern)=>{await db.query('savepoint rejection');await assert.rejects(fn,pattern);await db.query('rollback to savepoint rejection');};
 try{
  await db.query('begin');await db.query("set local lock_timeout='5s'");
  if(!(await one("select to_regclass('public.menu_availability_audit') installed")).installed)await db.query(fs.readFileSync('supabase/migrations/20261112090000_guard_menu_availability.sql','utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,''));
  const actor=await one("select id,store_id from profiles where lower(role)='cashier' and store_id is not null limit 1");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor.id]);
  const item=await one('select id,is_available,updated_at::text version,description from menu_items order by id limit 1');
  const initial=item.is_available!==false,client=randomUUID();
  const count=async()=>Number((await one("select count(*) n from menu_availability_audit where record_key->>'id'=$1",[item.id])).n);
  const baseline=await count();
  const write=async(value,version=item.version)=>(await one("select set_shared_menu_availability_checked($1,$2,$3,'pos',$4) result",[item.id,value,version,client])).result;
  await reject(()=>db.query('update menu_items set is_available=$1 where id=$2',[!initial,item.id]),/availability switch/);
  const saved=await write(!initial);
  assert.equal(saved.is_available,!initial);assert.equal(await count(),baseline+1);
  const audit=await one("select * from menu_availability_audit where record_key->>'id'=$1 order by changed_at desc limit 1",[item.id]);
  assert.equal(audit.actor_id,actor.id);assert.equal(audit.actor_store_id,String(actor.store_id));assert.equal(audit.source,'pos');assert.equal(audit.client_id,client);
  await write(!initial,item.version);assert.equal(await count(),baseline+1,'Repeat desired state must be a no-op');
  await reject(()=>write(initial,item.version),/another device/);
  await reject(()=>db.query('update menu_items set description=$1,is_available=$2 where id=$3',['STALE EDITOR',initial,item.id]),/availability switch/);
  assert.equal((await one('select description from menu_items where id=$1',[item.id])).description,item.description);
  const stale=await db.query('update menu_items set description=$1 where id=$2 and updated_at=$3 returning id',['STALE VERSION',item.id,item.version]);
  assert.equal(stale.rowCount,0);
  await db.query('select set_shared_menu_availability($1,$2)',[item.id,initial]);
  assert.equal((await one('select is_available from menu_items where id=$1',[item.id])).is_available,initial);
  await reject(()=>db.query('update menu_items set is_available=$1 where id=$2',[!initial,item.id]),/availability switch/);
  await db.query('update menu_items set description=$1 where id=$2',['Rollback-only ordinary edit',item.id]);
  assert.equal(await count(),baseline+2,'Ordinary metadata edits must not create availability events');
  await db.query("insert into menu_item_store_availability(item_id,store_id,is_available) values($1,$2,false) on conflict(item_id,store_id) do update set is_available=not menu_item_store_availability.is_available",[String(item.id),String(actor.store_id)]);
  assert.ok(await one("select id from menu_availability_audit where table_name='menu_item_store_availability' and record_key->>'item_id'=$1",[String(item.id)]));
  await db.query('delete from menu_item_store_availability where item_id=$1 and store_id=$2',[String(item.id),String(actor.store_id)]);
  assert.ok(await one("select id from menu_availability_audit where table_name='menu_item_store_availability' and record_key->>'item_id'=$1 and next_available is null",[String(item.id)]));
  const customer=await one("select id from profiles where lower(role) not in ('cashier','admin','super_admin','kitchen','kds') limit 1");
  if(customer){await db.query("select set_config('request.jwt.claim.sub',$1,true)",[customer.id]);await reject(()=>write(!initial,saved.updated_at),/Staff access/);}
  assert.equal((await one("select has_function_privilege('anon','public.set_shared_menu_availability_checked(text,boolean,timestamptz,text,uuid)','execute') allowed")).allowed,false);
  assert.equal((await one("select has_table_privilege('authenticated','public.menu_availability_audit','insert') allowed")).allowed,false);
  console.log('PASS: guarded availability, stale edits/version rejection, confirmed desired state, idempotent retry, legacy compatibility, audit account/branch/client/source, scoped override audit and permissions. All changes rolled back.');
 }finally{await db.query('rollback');await db.end();}
})().catch(error=>{console.error(error.message,error.where||'');process.exitCode=1});
