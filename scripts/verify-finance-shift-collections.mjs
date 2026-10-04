import fs from 'node:fs';import pg from 'pg';import nextEnv from '@next/env';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
nextEnv.loadEnvConfig(process.cwd());const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,statement_timeout:60000});await db.connect();
try{
 await db.query('begin');
 if(!(await db.query("select to_regprocedure('public.finance_capture_closed_shift(jsonb,jsonb)') installed")).rows[0].installed)await db.query(fs.readFileSync('supabase/migrations/20261004100000_finance_closed_shift_collections.sql','utf8').replace(/^begin;/,'').replace(/commit;\s*$/,''));
 if(!(await db.query("select to_regprocedure('public.finance_collection_payment_entries(jsonb)') installed")).rows[0].installed)await db.query(fs.readFileSync('supabase/migrations/20261004110000_finance_legacy_split_collections.sql','utf8').replace(/^begin;/,'').replace(/commit;\s*$/,''));
 const admin=(await db.query("select id from profiles where lower(role) in ('admin','super_admin') limit 1")).rows[0].id;
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[admin]);
 const store=(await db.query('select id::text id from stores limit 1')).rows[0].id;
 const sid='finance_verify_'+randomUUID();
 const receipt=(method,total,extra={})=>({id:randomUUID(),store_id:store,status:'paid',created_at:'2036-10-04T03:00:00Z',payment_method:method,total,...extra});
 const webId=randomUUID();
 const rows=[receipt('Cash',100),receipt('GCash',200),receipt('ShopeeFood',100),receipt('GrabPay',50),receipt('QRPH',50,{status:'voided'}),receipt('Card',100,{status:'refunded',refund_amount:100}),receipt('Split',100,{status:'partially_refunded',refund_amount:20,source_metadata:{payment_splits:[{method:'Cash',amount:50},{method:'GCash',amount:50}]}}),receipt('QRPH',80,{source_web_order_id:webId,_finance_source:'pos'}),receipt('QRPH',80,{id:webId,_finance_source:'web'})];
 await db.query('select public.finance_capture_closed_shift($1::jsonb,$2::jsonb)',[JSON.stringify({id:sid,store_id:store,mode:'open',created_at:'2036-10-04T02:00:00Z'}),JSON.stringify(rows)]);
 assert.equal((await db.query('select count(*)::int n from finance_cash_receivables where shift_id=$1',[sid])).rows[0].n,0);
 rows.push(receipt('Cash ₱40.00 + Card ₱60.00',100));
 const shift={id:sid,store_id:store,mode:'close',created_at:'2036-10-04T05:00:00Z',cashier_id:admin};
 await db.query('select public.finance_capture_closed_shift($1::jsonb,$2::jsonb)',[JSON.stringify(shift),JSON.stringify(rows)]);
 await db.query('select public.finance_capture_closed_shift($1::jsonb,$2::jsonb)',[JSON.stringify(shift),JSON.stringify(rows)]);
 const recv=(await db.query('select * from finance_cash_receivables where shift_id=$1',[sid])).rows;
 assert.equal(recv.length,5);const amounts=Object.fromEntries(recv.map(r=>[r.channel,Number(r.gross_amount)]));assert.deepEqual(amounts,{Card:60,GCash:240,GrabPay:50,QRPH:80,ShopeeFood:100});
 await db.query('select public.finance_capture_closed_shift($1::jsonb,$2::jsonb)',[JSON.stringify({...shift,id:sid+'_end',mode:'end_day',created_at:'2036-10-04T06:00:00Z'}),JSON.stringify(rows)]);
 assert.equal((await db.query('select count(*)::int n from finance_cash_receivables where shift_id=$1',[sid+'_end'])).rows[0].n,0);
 const account=(await db.query("select public.finance_cash_create_account($1,'bank') id",['Verify bank '+randomUUID()])).rows[0].id;
 const gcash=recv.find(r=>r.channel==='GCash'),request=randomUUID();
 const payload={request_id:request,kind:'collection',transaction_date:'2036-10-05',to_account_id:account,receivable_id:gcash.id,amount:110,fee:10,reference:'Verify remittance'};
 await db.query('select public.finance_cash_post($1::jsonb)',[JSON.stringify(payload)]);await db.query('select public.finance_cash_post($1::jsonb)',[JSON.stringify(payload)]);
 const snapshot=(await db.query("select public.finance_cash_collection_snapshot('2036-10-05') result")).rows[0].result;
 const settled=snapshot.find(r=>r.id===gcash.id);assert.equal(Number(settled.remitted),100);assert.equal(Number(settled.deductions),10);assert.equal(Number(settled.outstanding),130);assert.equal(settled.remittances.length,1);
 const before=(await db.query("select public.finance_cash_collection_snapshot('2036-10-04') result")).rows[0].result.find(r=>r.id===gcash.id);assert.equal(Number(before.outstanding),240);
 await db.query("insert into public.cashier_pos(id,store_id,cashier_id,mode,cash_total,sales_summary,created_at) values($1,$2,$3,'close',0,'{}','2036-10-04T07:00:00Z')",[sid+'_trigger',store,admin]);
 assert.equal((await db.query('select count(*)::int n from finance_cash_closed_shifts where id=$1',[sid+'_trigger'])).rows[0].n,1);
 await db.query("select set_config('request.jwt.claim.sub','',true)");await db.query('set local role authenticated');
 assert.equal((await db.query('select count(*)::int n from finance_cash_closed_shifts')).rows[0].n,0);
 await db.query('savepoint unauthorized');let rejected=false;try{await db.query("select public.finance_cash_collection_snapshot('2036-10-05')");}catch{rejected=true;}
 await db.query('rollback to savepoint unauthorized');assert.ok(rejected);await db.query('reset role');
 console.log('PASS: open shifts excluded; all non-cash channels; split payments; refunds; converted-web deduplication; closed-shift idempotency; End Day overlap exclusion; remittance amounts/dates/deductions; retry protection and historical balances. All writes rolled back.');
}finally{await db.query('rollback');await db.end();}
