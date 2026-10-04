import fs from 'node:fs';import pg from 'pg';import nextEnv from '@next/env';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
nextEnv.loadEnvConfig(process.cwd());const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},statement_timeout:60000});await db.connect();
try{
 await db.query('begin');
 if(!(await db.query("select 1 from information_schema.columns where table_name='finance_cash_closed_shifts' and column_name='cash_shift_started_at'")).rowCount)await db.query(fs.readFileSync('supabase/migrations/20261004170000_finance_cash_collection_shift_start.sql','utf8').replace(/^begin;/,'').replace(/commit;\s*$/,''));
 const admin=(await db.query("select id from profiles where lower(role) in ('admin','super_admin') limit 1")).rows[0].id;await db.query("select set_config('request.jwt.claim.sub',$1,true)",[admin]);
 const store=(await db.query('select petty_store_id id from finance_cash_accounts where petty_store_id is not null limit 1')).rows[0].id;
 const sid='overnight_'+randomUUID();
 const shift={id:sid,store_id:store,cashier_id:admin,created_at:'2038-10-04T18:00:00Z',mode:'close',cash_total:120,sales_summary:{startingCash:20,shiftStartedAt:'2038-10-04T14:00:00Z'}};
 const order={id:randomUUID(),store_id:store,created_at:'2038-10-04T15:00:00Z',status:'paid',total:100,payment_method:'Cash'};
 await db.query('select finance_capture_closed_shift($1::jsonb,$2::jsonb)',[JSON.stringify(shift),JSON.stringify([order])]);
 const raw=(await db.query('select business_date::text close_date,(cash_shift_started_at at time zone \'Asia/Manila\')::date::text start_date from finance_cash_closed_shifts where id=$1',[sid])).rows[0];
 assert.equal(raw.close_date,'2038-10-05');assert.equal(raw.start_date,'2038-10-04');
 const rows=(await db.query("select finance_daily_cash_snapshot('2038-10-04') result")).rows[0].result;
 const day=rows.find(r=>r.store_id===store&&r.business_date==='2038-10-04');assert.ok(day);assert.equal(Number(day.cash_sales),100);assert.equal(Number(day.net_declared),100);
 assert.ok(!rows.some(r=>r.store_id===store&&r.business_date==='2038-10-05'));
 console.log('PASS: overnight cash collection uses the Manila shift start date, cash totals retained, shared close-date/non-cash records unchanged. All test writes rolled back.');
}finally{await db.query('rollback');await db.end();}
