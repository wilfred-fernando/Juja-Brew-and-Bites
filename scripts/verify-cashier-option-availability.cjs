require('@next/env').loadEnvConfig(process.cwd());
const {Client}=require('pg');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
  const local=process.argv.includes('--local');
  if(!local && !process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for rollback-only RLS verification.');
  let db;
  if(local){
    const {PGlite}=require(require('node:path').join(require('node:os').tmpdir(),'pos-rls-verify/node_modules/@electric-sql/pglite'));
    const pg=new PGlite();
    db={connect:async()=>{},end:()=>pg.close(),query:async(sql,args)=>{
      const result=(!args && sql.includes(';')) ? (await pg.exec(sql)).at(-1) : await pg.query(sql,args);
      return {...result,rowCount:result.affectedRows ?? result.rows?.length ?? 0};
    }};
    await pg.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table stores(id uuid primary key); create table profiles(id uuid primary key,role text,store_id uuid);
      grant usage on schema public,auth to anon,authenticated; grant select on stores,profiles to authenticated;
      insert into stores values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
      insert into profiles values('00000000-0000-0000-0000-000000000011','cashier','00000000-0000-0000-0000-000000000001'),
        ('00000000-0000-0000-0000-000000000012','kds','00000000-0000-0000-0000-000000000001'),
        ('00000000-0000-0000-0000-000000000013','admin','00000000-0000-0000-0000-000000000002');`);
    await pg.exec(fs.readFileSync('supabase/migrations/20260712093000_option_selection_store_availability.sql','utf8').replace('to service_role','to authenticated'));
  } else db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  await db.connect();
  try {
    await db.query('begin');
    const sql=fs.readFileSync('supabase/migrations/20261102090000_cashier_option_selection_availability.sql','utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,'');
    await db.query(sql);
    const cashier=(await db.query("select id,store_id from profiles where lower(role)='cashier' and store_id is not null limit 1")).rows[0];
    assert(cashier);
    const other=(await db.query('select id from stores where id::text<>$1 limit 1',[cashier.store_id])).rows[0];
    assert(other);
    const key='rollback-'+randomUUID();
    await db.query("insert into option_selection_store_availability(store_id,group_key,option_key,group_name,option_name,is_available) values($1,$2,'test','Verification','Test',true)",[other.id,key]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[cashier.id]);
    await db.query('set local role authenticated');
    const save=async(store,available)=>(await db.query(`insert into option_selection_store_availability(store_id,group_key,option_key,group_name,option_name,is_available)
      values($1,$2,'test','Verification','Test',$3) on conflict(store_id,group_key,option_key)
      do update set is_available=excluded.is_available returning *`,[store,key,available])).rows[0];
    assert.equal((await save(cashier.store_id,false)).is_available,false);
    assert.equal((await save(cashier.store_id,true)).is_available,true);
    const deny=async(fn)=>{await db.query('savepoint denied');await assert.rejects(fn,/row-level security|permission denied/);await db.query('rollback to savepoint denied');};
    await deny(()=>save(other.id,false));
    await deny(()=>db.query('update option_selection_store_availability set store_id=$1 where store_id=$2 and group_key=$3',[other.id,cashier.store_id,key]));
    assert.equal((await db.query('delete from option_selection_store_availability where store_id=$1 and group_key=$2 returning id',[cashier.store_id,key])).rowCount,0);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[randomUUID()]);
    await deny(()=>save(cashier.store_id,false));
    await db.query('reset role');
    assert.equal((await db.query('select is_available from option_selection_store_availability where store_id=$1 and group_key=$2',[other.id,key])).rows[0].is_available,true);
    for(const role of ['kds','admin']){
      const actor=(await db.query('select id,store_id from profiles where role=$1 and store_id is not null limit 1',[role])).rows[0];
      if(!actor) continue;
      await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor.id]);
      await db.query('set local role authenticated');
      assert.equal((await save(actor.store_id,false)).is_available,false,`${role} access remains intact`);
      await db.query('reset role');
    }
    await db.query('rollback');
    console.log(`PASS (${local?'local PostgreSQL':'live database'}, rollback): cashier insert/update, returned rows, cross-branch upsert/move denied, delete denied, unknown user denied, kitchen/admin access preserved`);
  }catch(error){await db.query('rollback');throw error;}finally{await db.end();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
