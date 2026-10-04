import fs from 'node:fs';import pg from 'pg';import nextEnv from '@next/env';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
nextEnv.loadEnvConfig(process.cwd());const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},statement_timeout:60000});await db.connect();
try{
 await db.query('begin');
 if(!(await db.query("select to_regprocedure('public.finance_daily_cash_snapshot(date)') installed")).rows[0].installed)await db.query(fs.readFileSync('supabase/migrations/20261004160000_finance_daily_cash_collections.sql','utf8').replace(/^begin;/,'').replace(/commit;\s*$/,''));
 if(!(await db.query("select 1 from information_schema.columns where table_name='finance_cash_receivables' and column_name='cash_sales_date'")).rowCount)await db.query(fs.readFileSync('supabase/migrations/20261004180000_finance_cash_sales_receiving.sql','utf8').replace(/^begin;/,'').replace(/commit;\s*$/,''));
 const admin=(await db.query("select id from profiles where lower(role) in ('admin','super_admin') limit 1")).rows[0].id;await db.query("select set_config('request.jwt.claim.sub',$1,true)",[admin]);
 const store=(await db.query('select petty_store_id id from finance_cash_accounts where petty_store_id is not null limit 1')).rows[0].id;
 const shift='cash_test_'+randomUUID();
 const order={id:randomUUID(),store_id:store,created_at:'2037-10-04T03:00:00Z',status:'partially_refunded',total:200,refund_amount:40,payment_splits:[{method:'Cash',amount:100},{method:'GCash',amount:100}]};
 await db.query('select finance_capture_closed_shift($1::jsonb,$2::jsonb)',[JSON.stringify({id:shift,store_id:store,cashier_id:admin,created_at:'2037-10-04T04:00:00Z',mode:'close',cash_total:100,sales_summary:{startingCash:20,shiftStartedAt:"2037-10-04T01:00:00Z"}}),JSON.stringify([order])]);
 await db.query('select finance_capture_closed_shift($1::jsonb,$2::jsonb)',[JSON.stringify({id:shift+'_end',store_id:store,cashier_id:admin,created_at:'2037-10-04T05:00:00Z',mode:'end_day',cash_total:130,sales_summary:{startingCash:30,shiftStartedAt:"2037-10-04T01:00:00Z"}}),JSON.stringify([order])]);
 const snapshot=async(date)=>(await db.query('select finance_daily_cash_snapshot($1::date) result',[date])).rows[0].result.find(r=>r.store_id===store&&r.business_date==='2037-10-04');
 let day=await snapshot('2037-10-04');assert.equal(Number(day.cash_sales),80);assert.equal(Number(day.net_declared),100);assert.equal(Number(day.variance),20);assert.equal(day.count_basis,'end_day');
 const payload={request_id:randomUUID(),store_id:store,business_date:'2037-10-04',transaction_date:'2037-10-05',amount:40,fee:5,to_account_id:(await db.query('select id from finance_cash_accounts where petty_store_id=$1',[store])).rows[0].id,reference:'Daily cash test'};
 const post=async(data)=>(await db.query('select finance_cash_sales_transfer($1::jsonb) id',[JSON.stringify(data)])).rows[0].id;
 const tid=await post(payload);
 const movement=(await db.query('select * from finance_cash_transactions where id=$1',[tid])).rows[0];assert.equal(movement.kind,'collection');assert.equal(movement.from_account_id,null);assert.equal(movement.to_account_id,payload.to_account_id);
 const cashIn=(await db.query('select * from finance_petty_cash_funds where remittance_transaction_id=$1',[tid])).rows[0];assert.equal(Number(cashIn.amount),35);assert.equal(cashIn.source_of_fund,'CASH SALES');
 assert.equal(day.source_label,'Cash Sales');
 const noncash=(await db.query("select finance_cash_collection_snapshot('2037-10-05') result")).rows[0].result;assert.ok(!noncash.some(r=>r.cash_sales_date));assert.equal(await post(payload),tid);day=await snapshot('2037-10-05');assert.equal(Number(day.remaining),60);assert.equal(Number(day.transfer_fees),5);assert.equal(Number((await snapshot('2037-10-04')).remaining),100);
 await db.query('savepoint invalid');let rejected=false;try{await post({...payload,request_id:randomUUID(),amount:61});}catch{rejected=true;}await db.query('rollback to savepoint invalid');assert.ok(rejected);
 await db.query("select finance_cash_reverse($1,'2037-10-06','Correction')",[tid]);assert.equal(Number((await snapshot('2037-10-06')).remaining),100);
 const existing=(await db.query('select finance_cash_post($1::jsonb) id',[JSON.stringify({...payload,request_id:randomUUID(),kind:'inflow',from_account_id:null,amount:30,fee:0})])).rows[0].id;
 await post({store_id:store,business_date:'2037-10-04',transaction_id:existing});assert.equal(Number((await snapshot('2037-10-06')).remaining),70);
 await db.query("select set_config('request.jwt.claim.sub','',true)");await db.query('savepoint denied');rejected=false;try{await snapshot('2037-10-06');}catch{rejected=true;}await db.query('rollback to savepoint denied');assert.ok(rejected);
 const linked=(await db.query('select count(*)::int n from finance_cash_transactions where id=$1',[existing])).rows[0].n;assert.equal(linked,1);
 console.log('PASS: split cash sales, refunds, End Day overlap, initial fund deduction, declared variance, transfer fees, retries, over-transfer rejection, reversals, existing Cash In linking, Cash Sales source, own-branch receiving, no petty cash debit, net Cash In and non-cash separation, historical dates and admin access. All writes rolled back.');
}finally{await db.query('rollback');await db.end();}
