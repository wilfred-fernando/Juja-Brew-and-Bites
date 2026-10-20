import fs from 'node:fs';import pg from 'pg';import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,statement_timeout:60000});await db.connect();
try{
 await db.query('begin');await db.query("set local lock_timeout='10s'");await db.query("select pg_advisory_xact_lock(hashtextextended('finance_reporting_start_migration',0))");
 if(!(await db.query("select to_regclass('public.finance_cash_reporting_transactions') installed")).rows[0].installed){await db.query(fs.readFileSync('supabase/migrations/20261020090000_finance_reporting_start_date.sql','utf8').replace(/^begin;/,'').replace(/commit;\s*$/,''));console.log('Cash Flow reporting starts August 11, 2026. Historical data retained.');}
 else console.log('August 11 reporting boundary is already installed.');
 await db.query("notify pgrst,'reload schema'");await db.query('commit');
}catch(error){await db.query('rollback');throw error;}finally{await db.end();}
