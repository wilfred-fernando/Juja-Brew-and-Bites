/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS database operation script */
require('@next/env').loadEnvConfig(process.cwd());
const { Client } = require('pg');
const { readFileSync } = require('fs');
const { randomUUID } = require('crypto');
const assert = require('assert/strict');
(async()=>{
 const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});await db.connect();
 try {
  const sql=readFileSync('supabase/migrations/20261007010000_preserve_pending_kds_batches.sql','utf8');
  // Install and exercise the safeguard in one rollback-only transaction first.
  await db.query(sql.replace(/commit;\s*$/i,''));
  const source=randomUUID();
  const initial=[{id:'old',name:'SPAM Kimchi Rice',quantity:1,kdsCompleted:false,kitchenReady:false}];
  const saved=await db.query("insert into kds_tickets(source_type,source_id,items,status) values('pos',$1,$2,'preparing') returning id",[source,JSON.stringify(initial)]);
  const update=[{...initial[0],kdsCompleted:true,kitchenReady:true},{id:'new',name:'Boneless Chicken',quantity:1}];
  await db.query('update kds_tickets set items=$1 where id=$2',[JSON.stringify(update),saved.rows[0].id]);
  let rows=(await db.query('select source_id,items,status from kds_tickets where source_id=$1 or source_id like $2',[source,source+':batch:%'])).rows;
  assert.equal(rows.length,2);assert.deepEqual(rows.find(r=>r.source_id===source).items,initial);
  const batch=rows.find(r=>r.source_id!==source);assert.equal(batch.items.length,1);assert.equal(batch.items[0].name,'Boneless Chicken');
  await db.query('update kds_tickets set items=$1 where id=$2',[JSON.stringify(update),saved.rows[0].id]);
  assert.equal((await db.query('select count(*)::int as count from kds_tickets where source_id like $1',[source+':batch:%'])).rows[0].count,1);
  await db.query('update kds_tickets set items=$1 where id=$2',[JSON.stringify([{...initial[0],kitchenReady:true}]),saved.rows[0].id]);
  assert.equal((await db.query('select items from kds_tickets where id=$1',[saved.rows[0].id])).rows[0].items[0].kitchenReady,true);
  await db.query('ROLLBACK');
  console.log('PASS: pending parent preserved, separate addition card, retry deduplication, normal kitchen progress; test records rolled back');
  if(process.argv.includes('--apply')){await db.query(sql);console.log('APPLIED: live KDS batch safeguard');}
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
