import fs from 'node:fs';import pg from 'pg';import nextEnv from '@next/env';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {pettyCashMonthlySummary} from '../lib/pettyCashMonthlySummary.js';
nextEnv.loadEnvConfig(process.cwd());const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,statement_timeout:60000});await db.connect();
try{
 await db.query('begin');if(!(await db.query("select to_regprocedure('public.payroll_salary_expense_sync()') installed")).rows[0].installed)await db.query(fs.readFileSync('supabase/migrations/20261111110000_payroll_salary_expenses.sql','utf8').replace(/^begin;/,'').replace(/commit;\s*$/,''));
 const admin=(await db.query("select id from profiles where lower(role)='super_admin' limit 1")).rows[0].id;await db.query("select set_config('request.jwt.claim.sub',$1,true)",[admin]);await db.query('set local role authenticated');
 const id='salary-test-'+randomUUID(),id2=id+'-other';await db.query('insert into payroll_employees(id,full_name) values($1,$1),($2,$2)',[id,id2]);
 await db.query("insert into payroll_periods(id,label,period_start,period_end,pay_date) values($1,$1,'2039-11-01','2039-11-07','2039-11-08')",[id]);
 await db.query("insert into payroll_entries(id,employee_id,period_id,gross_total,deduction_total,net_total) values($1,$1,$1,600,100,500),($2,$2,$1,800,100,700)",[id,id2]);
 const count=async()=>(await db.query('select count(*)::int n from finance_expenses where payroll_entry_id in ($1,$2)',[id,id2])).rows[0].n;
 const reject=async fn=>{await db.query('savepoint bad');let rejected=false;try{await fn();}catch{rejected=true;}await db.query('rollback to savepoint bad');assert.ok(rejected);};
 await reject(()=>db.query("update payroll_entries set status='paid' where id=$1",[id]));assert.equal(await count(),0);
 await db.query("update payroll_entries set status='approved' where id in ($1,$2)",[id,id2]);assert.equal(await count(),0);
 await db.query("update payroll_entries set status='paid' where id=$1",[id]);assert.equal(await count(),1);
 const expense=(await db.query('select * from finance_expenses where payroll_entry_id=$1',[id])).rows[0];assert.equal(Number(expense.total),500);assert.equal(expense.payroll_employee_id,id);assert.equal(expense.supplier_name,id);assert.equal(expense.description,'Payroll Salary');assert.equal(expense.tax_type,'Non-VAT');assert.equal(expense.is_cash_advance,false);
 await db.query("update payroll_entries set status='paid' where id=$1",[id]);assert.equal(await count(),1);
 await db.query("update payroll_entries set status='paid' where id=$1",[id2]);assert.equal(await count(),2);
 const report=pettyCashMonthlySummary((await db.query('select * from finance_expenses where payroll_entry_id in ($1,$2)',[id,id2])).rows,(await db.query("select * from finance_references where ref_type='item' and name='Payroll Salary'")).rows,{includePcv:false});assert.equal(report.totals[report.headers.indexOf('Salary')],1200);
 await reject(()=>db.query('delete from finance_expenses where id=$1',[expense.id]));await reject(()=>db.query('update finance_expenses set total=999 where id=$1',[expense.id]));await reject(()=>db.query('update payroll_entries set net_total=999 where id=$1',[id]));await reject(()=>db.query("update payroll_entries set status='draft' where id=$1",[id]));
 console.log('PASS: approval then payment required; one Salary expense per employee; net pay amount; no duplicates; Salary summary totals; linked records protected. All database test writes rolled back.');
}finally{await db.query('rollback');await db.end();}
