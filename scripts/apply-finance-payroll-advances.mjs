import fs from 'node:fs';import pg from 'pg';import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,statement_timeout:60000});await db.connect();
try{
 await db.query('begin');await db.query("set local lock_timeout='10s'");await db.query("select pg_advisory_xact_lock(hashtextextended('finance_payroll_advance_migration',0))");
 if(!(await db.query("select to_regprocedure('public.finance_cash_advance_options()') installed")).rows[0].installed){
  await db.query(fs.readFileSync('supabase/migrations/20261004190000_finance_payroll_cash_advances.sql','utf8').replace(/^begin;/,'').replace(/commit;\s*$/,''));
  console.log('Finance expense to payroll cash advance synchronization installed. Existing expenses were not automatically classified.');
 }else console.log('Finance/payroll cash advance schema already installed.');
 await db.query("notify pgrst,'reload schema'");await db.query('commit');
}catch(error){await db.query('rollback');throw error;}finally{await db.end();}
