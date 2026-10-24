import fs from 'node:fs';import pg from 'pg';import nextEnv from '@next/env';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
nextEnv.loadEnvConfig(process.cwd());const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,statement_timeout:60000});await db.connect();
try{
 await db.query('begin');
 if(!(await db.query("select to_regclass('public.finance_entry_edit_logs') installed")).rows[0].installed)await db.query(fs.readFileSync('supabase/migrations/20261024100000_finance_entry_edit_log.sql','utf8').replace(/^begin;/,'').replace(/commit;\s*$/,''));
 const admin=(await db.query("select id from profiles where lower(role) in ('admin','super_admin') limit 1")).rows[0].id;
 const cashier=(await db.query("select id from profiles where lower(role)='cashier' limit 1")).rows[0]?.id;
 const employee=(await db.query('select id from payroll_employees limit 1')).rows[0].id;
 const store=(await db.query('select petty_store_id id from finance_cash_accounts where petty_store_id is not null limit 1')).rows[0].id;
 const base=(await db.query('select to_jsonb(e) row from finance_expenses e limit 1')).rows[0].row;
 const date=(await db.query("select (now() at time zone 'Asia/Manila')::date::text as log_date")).rows[0].log_date;
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[admin]);await db.query('set local role authenticated');
 const id='audit_test_'+randomUUID();const row={...base,id,expense_date:'2038-10-04',description:'Audit creation',is_cash_advance:false,employee_id:null,cash_advance_id:null,petty_cash_entry_id:null,entry_source:'overall',inventory_item_id:null,total:100,subtotal:100,quantity:1,unit_price:100,discount:0,created_by:admin};
 await db.query('select finance_save_expense_receipt($1,$2::jsonb)', ['overall',JSON.stringify([row])]);
 await db.query("select finance_update_expense('overall',$1,$2::jsonb)",[id,JSON.stringify({description:'Audit edited',remarks:'New note'})]);
 const entries=async(record)=>(await db.query('select * from finance_entry_edit_logs where record_id=$1 order by id',[record])).rows;
 let history=await entries(id);assert.equal(history.length,2);assert.equal(history[0].action,'INSERT');assert.equal(history[0].actor_id,admin);assert.equal(history[1].before_data.description,'Audit creation');assert.equal(history[1].after_data.description,'Audit edited');assert.ok(history[1].changed_fields.includes('description'));
 await db.query('update finance_expenses set updated_at=clock_timestamp() where id=$1',[id]);assert.equal((await entries(id)).length,2);
 await db.query('delete from finance_expenses where id=$1',[id]);history=await entries(id);assert.equal(history.length,3);assert.equal(history[2].action,'DELETE');assert.equal(history[2].before_data.description,'Audit edited');assert.equal(history[2].after_data,null);
 const list=(await db.query('select finance_entry_log_list($1::date,$1::date,$2,null,null,null,$3,0,1) result',[date,'finance_expenses',id])).rows[0].result;assert.equal(Number(list.total),3);assert.equal(list.rows.length,1);assert.equal(list.rows[0].action,'DELETE');assert.ok(!Object.hasOwn(list.rows[0],'before_data'));
 const detail=(await db.query('select finance_entry_log_detail($1) result',[history[1].id])).rows[0].result;assert.equal(detail.before_data.description,'Audit creation');
 const reject=async(fn)=>{await db.query('savepoint invalid');let failed=false;try{await fn();}catch{failed=true;}await db.query('rollback to savepoint invalid');assert.ok(failed);};
 await reject(()=>db.query('delete from finance_entry_edit_logs where id=$1',[history[0].id]));await reject(()=>db.query("update finance_entry_edit_logs set actor_name='Forged' where id=$1",[history[0].id]));
 const petty={...row,id:'audit_petty_'+randomUUID(),store_id:store};await db.query('select finance_save_expense_receipt($1,$2::jsonb,$3::jsonb)',['petty',JSON.stringify([petty]),JSON.stringify([{...petty,id:'audit_mirror_'+randomUUID(),entry_source:'petty_cash',petty_cash_entry_id:petty.id}])]);
 const movement=(await db.query('select id from finance_cash_transactions where source_table=$1 and source_record_id=$2',['finance_petty_cash_entries',petty.id])).rows[0];assert.ok(movement);const linked=await entries(movement.id);assert.equal(linked.length,1);assert.equal(linked[0].linked_update,true);assert.equal(linked[0].actor_id,admin);
 const advance='audit_advance_'+randomUUID();await db.query("insert into payroll_cash_advances(id,employee_id,advance_date,amount,reason) values($1,$2,'2038-10-04',100,'Audit test')",[advance,employee]);assert.equal((await entries(advance))[0].source_table,'payroll_cash_advances');
 const bad='audit_rollback_'+randomUUID();await reject(()=>db.query('select finance_save_expense_receipt($1,$2::jsonb)',['overall',JSON.stringify([{...row,id:bad,category:''}])]));assert.equal((await entries(bad)).length,0);
 const options=(await db.query('select finance_entry_log_options() result')).rows[0].result;assert.equal(options.tables.length,25);assert.ok(options.actors.some(a=>a.actor_id===admin));
 if(cashier){await db.query("select set_config('request.jwt.claim.sub',$1,true)",[cashier]);assert.equal((await db.query('select count(*)::int n from finance_entry_edit_logs')).rows[0].n,0);await reject(()=>db.query('select finance_entry_log_detail($1)',[history[0].id]));}
 await db.query("select set_config('request.jwt.claim.sub','',true)");await reject(()=>db.query('select finance_entry_log_list($1::date,$1::date)',[date]));
 await db.query('reset role');await reject(()=>db.query('delete from finance_entry_edit_logs where id=$1',[history[0].id]));
 await db.query("insert into finance_cash_accounts(name,kind,created_by) values($1,'bank',$2)",['Audit system '+randomUUID(),admin]);const system=(await db.query("select actor_name,actor_id from finance_entry_edit_logs where source_table='finance_cash_accounts' order by id desc limit 1")).rows[0];assert.equal(system.actor_id,null);assert.equal(system.actor_name,'System / service job');
 console.log('PASS: creation/edit/deletion snapshots, changed fields, actor attribution, no-op suppression, list filters/pagination, detail access, linked cash updates, payroll coverage, failed-write rollback, immutable logs, admin/cashier separation and system attribution. All verification writes rolled back.');
}finally{await db.query('rollback');await db.end();}
