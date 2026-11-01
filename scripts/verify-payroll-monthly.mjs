import fs from 'node:fs';import pg from 'pg';import nextEnv from '@next/env';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {monthlyPayrollPeriod,monthlyAttendance,monthlyDeductions} from '../lib/payroll/monthlyPayroll.js';
const period=monthlyPayrollPeriod('2028-02');assert.equal(period.period_end,'2028-02-29');assert.equal(period.pay_date,'2028-03-01');assert.equal(monthlyPayrollPeriod('2026-12').pay_date,'2027-01-01');assert.throws(()=>monthlyPayrollPeriod('2026-13'));
assert.equal(monthlyAttendance([{employee_id:'a',work_date:'2028-02-01',id:'1',updated_at:'1'},{employee_id:'a',work_date:'2028-02-01',id:'2',updated_at:'2'},{employee_id:'b',work_date:'2028-02-01'}],'a',period)[0].id,'2');
assert.equal(monthlyDeductions([{employee_id:'a',payment_date:'2028-02-01',method:'cash',amount:10},{employee_id:'a',payment_date:'2028-02-02',method:'payroll deduction',amount:20}],'a',period,[]).length,1);
nextEnv.loadEnvConfig(process.cwd());const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,statement_timeout:60000});await db.connect();
try{
 await db.query('begin');if(!(await db.query("select to_regprocedure('public.payroll_generate_monthly(text,jsonb)') installed")).rows[0].installed)await db.query(fs.readFileSync('supabase/migrations/20261101100000_payroll_monthly_generation.sql','utf8').replace(/^begin;/,'').replace(/commit;\s*$/,''));
 const admin=(await db.query("select id from profiles where lower(role) in ('admin','super_admin') limit 1")).rows[0].id;await db.query("select set_config('request.jwt.claim.sub',$1,true)",[admin]);
 const id='monthly-test-'+randomUUID(),id2=id+'-other';await db.query('insert into payroll_employees(id,full_name) values($1,$1),($2,$2)',[id,id2]);
 await db.query("insert into payroll_attendance(id,employee_id,work_date,period_id,status) select $1,$1,'2038-02-01',id,'present' from payroll_periods limit 1",[id]);
 const generate=async (employee=id,amount=500)=>(await db.query('select payroll_generate_monthly($1,$2) result',['2038-02',JSON.stringify({employee_id:employee,daily_rate:500,days_worked:1,gross_total:amount,net_total:amount})])).rows[0].result;
 const first=await generate();assert.equal(first.entry.employee_id,id);assert.equal(first.entry.net_total,500);assert.equal(first.period.period_end,'2038-02-28');assert.equal(first.entry.status,'draft');assert.equal((await generate(id,999)).entry.net_total,500);
 await db.query("insert into payroll_periods(id,label,period_start,period_end,pay_date) values($1,$1,'2038-02-01','2038-02-07','2038-02-08')",[id]);
 const reject=async fn=>{await db.query('savepoint invalid');let failed=false;try{await fn();}catch{failed=true;}await db.query('rollback to savepoint invalid');assert.ok(failed);};
 await reject(()=>db.query('insert into payroll_entries(id,employee_id,period_id) values($1,$1,$1)',[id]));
 await reject(()=>generate(id2));
 await db.query("insert into payroll_entries(id,employee_id,period_id) values($1,$1,$2)",[id2,id]);
 await db.query("insert into payroll_attendance(id,employee_id,work_date,period_id,status) values($1,$1,'2038-02-02',$2,'present')",[id2,id]);
 await reject(()=>generate(id2));
 await db.query("select set_config('request.jwt.claim.sub','',true)");await reject(()=>generate());
 console.log('PASS: month boundaries, leap year, unique attendance dates, payroll-only deductions, single employee draft, retry without overwrite, overlap guards in both directions, no attendance rejection and administrator access. All database writes rolled back.');
}finally{await db.query('rollback');await db.end();}
