import fs from 'node:fs';import pg from 'pg';import nextEnv from '@next/env';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
nextEnv.loadEnvConfig(process.cwd());const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,statement_timeout:60000});await db.connect();
try{
 await db.query('begin');
 if(!(await db.query("select to_regprocedure('public.finance_remittance_petty_cash_trigger()') installed")).rows[0].installed)await db.query(fs.readFileSync('supabase/migrations/20261004130000_finance_petty_cash_remittances.sql','utf8').replace(/^begin;/,'').replace(/commit;\s*$/,''));
 if(!(await db.query("select to_regclass('public.finance_petty_movement_branch') installed")).rows[0].installed) await db.query(fs.readFileSync('supabase/migrations/20261004140000_finance_all_petty_cash_movements.sql','utf8').replace(/^begin;/,'').replace(/commit;\s*$/,''));
 const admin=(await db.query("select id from profiles where lower(role) in ('admin','super_admin') limit 1")).rows[0].id;
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[admin]);
 const account=(await db.query('select id,petty_store_id from finance_cash_accounts where petty_store_id is not null limit 1')).rows[0];
 assert.ok(account,'An integrated branch petty cash account is required');
 const recv=(await db.query("select finance_cash_create_receivable($1::jsonb) id",[JSON.stringify({channel:'GCash',period_start:'2036-10-04',period_end:'2036-10-04',gross_amount:200,reference:'Rollback remittance'})])).rows[0].id;
 const payload={request_id:randomUUID(),kind:'collection',transaction_date:'2036-10-05',to_account_id:account.id,receivable_id:recv,amount:110,fee:10,reference:'Rollback petty remittance'};
 const post=async()=>(await db.query('select finance_cash_post($1::jsonb) id',[JSON.stringify(payload)])).rows[0].id;
 const t=await post();assert.equal(await post(),t);
 const fund=(await db.query('select * from finance_petty_cash_funds where remittance_transaction_id=$1',[t])).rows;
 assert.equal(fund.length,1);assert.equal(Number(fund[0].amount),100);assert.equal(fund[0].store_id,account.petty_store_id);
 assert.equal((await db.query("select count(*)::int n from finance_cash_transactions where source_record_id=$1",[fund[0].id])).rows[0].n,0);
 const reject=async(fn)=>{await db.query('savepoint invalid');let failed=false;try{await fn();}catch{failed=true;}await db.query('rollback to savepoint invalid');assert.ok(failed);};
 await reject(()=>db.query('update finance_petty_cash_funds set amount=50 where id=$1',[fund[0].id]));
 await reject(()=>db.query('delete from finance_petty_cash_funds where id=$1',[fund[0].id]));

 await db.query("select finance_cash_reverse($1,'2036-10-06','Rollback correction')",[t]);
 const total=(await db.query("select sum(amount) amount from finance_petty_cash_funds where particular in ('Rollback petty remittance','Reversal: Rollback petty remittance') and store_id=$1",[account.petty_store_id])).rows[0].amount;
 assert.equal(Number(total),0);
 const outstanding=(await db.query("select finance_cash_collection_snapshot('2036-10-06') result")).rows[0].result.find(r=>r.id===recv).outstanding;assert.equal(Number(outstanding),200);
 const branches=(await db.query('select id,petty_store_id from finance_cash_accounts where petty_store_id is not null limit 2')).rows;
 assert.equal(branches.length,2);
 const transfer={request_id:randomUUID(),kind:'transfer',transaction_date:'2036-10-07',from_account_id:branches[0].id,to_account_id:branches[1].id,amount:100,fee:5,reference:'Rollback transfer'};
 const tid=(await db.query('select finance_cash_post($1::jsonb) id',[JSON.stringify(transfer)])).rows[0].id;
 const funds=(await db.query('select store_id,amount from finance_petty_cash_funds where remittance_transaction_id=$1',[tid])).rows;
 assert.equal(funds.length,2);assert.equal(Number(funds.find(f=>f.store_id===branches[0].petty_store_id).amount),-100);assert.equal(Number(funds.find(f=>f.store_id===branches[1].petty_store_id).amount),95);
 await db.query('select finance_cash_post($1::jsonb)',[JSON.stringify(transfer)]);assert.equal((await db.query('select count(*)::int n from finance_petty_cash_funds where remittance_transaction_id=$1',[tid])).rows[0].n,2);
 await db.query("select finance_cash_reverse($1,'2036-10-08','Rollback correction')",[tid]);
 for(const b of branches)assert.equal(Number((await db.query("select sum(amount) total from finance_petty_cash_funds where store_id=$1 and particular in ('Rollback transfer','Reversal: Rollback transfer')",[b.petty_store_id])).rows[0].total),0);
 console.log('PASS: petty cash remittance, net Cash In, retry deduplication, no duplicate ledger movement, protected funds, branch-to-branch transfer with fees and dated reversal. All writes rolled back.');
}finally{await db.query('rollback');await db.end();}
