import fs from 'node:fs';
import pg from 'pg';
import nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for rollback-only verification');
const db = new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,statement_timeout:60000});
await db.connect();
try {
 await db.query('begin');
 const exists = (await db.query("select to_regclass('public.finance_cash_accounts') as table_name")).rows[0].table_name;
 if (!exists) await db.query(fs.readFileSync('supabase/migrations/20261002090000_finance_cash_flow.sql','utf8').replace(/^begin;/,'').replace(/commit;\s*$/,''));
 const admin=(await db.query("select id from public.profiles where lower(role) in ('admin','super_admin') limit 1")).rows[0];
 assert.ok(admin,'An admin profile is required');
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[admin.id]);
 async function rpc(sql,args=[]) {return (await db.query(sql,args)).rows[0].result;}
 async function reject(sql,args) {await db.query('savepoint expected_failure');let failed=false;try {await db.query(sql,args);}catch {failed=true;}await db.query('rollback to savepoint expected_failure');assert.ok(failed,'Expected database rejection');}
 const prefix='Verify '+randomUUID();
 const baseline=await rpc("select public.finance_cash_snapshot('2026-10-01','2026-10-02') result");
 const a=await rpc('select public.finance_cash_create_account($1,$2) result',[prefix+' Bank','bank']);
 const b=await rpc('select public.finance_cash_create_account($1,$2) result',[prefix+' Wallet','wallet']);
 const post=async data=>rpc('select public.finance_cash_post($1::jsonb) result',[JSON.stringify({request_id:randomUUID(),transaction_date:'2026-10-02',reference:prefix,...data})]);
 await post({kind:'opening',to_account_id:a,amount:1000});
 const transfer={request_id:randomUUID(),kind:'transfer',from_account_id:a,to_account_id:b,amount:200,fee:10};
 const transferId=await post(transfer);assert.equal(await post(transfer),transferId);
 const r=await rpc('select public.finance_cash_create_receivable($1::jsonb) result',[JSON.stringify({channel:'GrabFood',period_start:'2026-10-01',period_end:'2026-10-02',gross_amount:500,reference:prefix})]);
 const collectionId=await post({kind:'collection',to_account_id:a,receivable_id:r,amount:300,fee:30});
 await reject('select public.finance_cash_post($1::jsonb)',[JSON.stringify({request_id:randomUUID(),transaction_date:'2026-10-02',reference:prefix,kind:'collection',to_account_id:a,receivable_id:r,amount:201})]);
 await reject('select public.finance_cash_post($1::jsonb)',[JSON.stringify({request_id:randomUUID(),transaction_date:'2026-10-02',reference:prefix,kind:'transfer',from_account_id:a,to_account_id:a,amount:10})]);
 let snapshot=await rpc("select public.finance_cash_snapshot('2026-10-01','2026-10-02') result");
 assert.equal(Number(snapshot.accounts.find(x=>x.id===a).balance),1070);
 assert.equal(Number(snapshot.accounts.find(x=>x.id===b).balance),190);
 assert.equal(Number(snapshot.receivables.find(x=>x.id===r).outstanding),200);
 assert.equal(Number(snapshot.flow.inflow)-Number(baseline.flow.inflow),270);
 assert.equal(Number(snapshot.flow.outflow)-Number(baseline.flow.outflow),10);
 assert.equal(Number(snapshot.flow.fees)-Number(baseline.flow.fees),40);
 await rpc("select public.finance_cash_reverse($1,'2026-10-02','Verification reversal') result",[collectionId]);
 snapshot=await rpc("select public.finance_cash_snapshot('2026-10-01','2026-10-02') result");
 assert.equal(Number(snapshot.accounts.find(x=>x.id===a).balance),800);
 assert.equal(Number(snapshot.receivables.find(x=>x.id===r).outstanding),500);
 assert.equal(Number(snapshot.flow.inflow)-Number(baseline.flow.inflow),0);
 await post({kind:'collection',transaction_date:'2026-10-03',to_account_id:a,receivable_id:r,amount:100,fee:5});
 await reject('select public.finance_cash_post($1::jsonb)',[JSON.stringify({request_id:randomUUID(),transaction_date:'2026-10-02',reference:prefix,kind:'collection',to_account_id:a,receivable_id:r,amount:100})]);
 snapshot=await rpc("select public.finance_cash_snapshot('2026-10-01','2026-10-02') result");
 assert.equal(Number(snapshot.receivables.find(x=>x.id===r).outstanding),500);
 await reject("select public.finance_cash_reverse($1,'2026-10-02','Duplicate reversal')",[collectionId]);
 for(const table of ['finance_cash_accounts','finance_cash_receivables','finance_cash_transactions']){
  const permissions=(await db.query("select has_table_privilege('authenticated',$1,'INSERT') can_write, has_table_privilege('anon',$1,'SELECT') can_read",['public.'+table])).rows[0];assert.equal(permissions.can_write,false);assert.equal(permissions.can_read,false);
 }
 await db.query("select set_config('request.jwt.claim.sub','',true)");
 await db.query('set local role authenticated');
 for(const table of ['finance_cash_accounts','finance_cash_receivables','finance_cash_transactions']) assert.equal(Number((await db.query(`select count(*) as count from public.${table}`)).rows[0].count),0);
 await reject("select public.finance_cash_snapshot('2026-10-01','2026-10-02')",[]);
 await db.query('reset role');
 console.log('PASS: migration, balances, atomic transfer, retry deduplication, partial collection, overcollection rejection, same-account rejection, reversal, duplicate reversal rejection, and access restrictions. All changes rolled back.');
} finally {await db.query('rollback');await db.end();}
