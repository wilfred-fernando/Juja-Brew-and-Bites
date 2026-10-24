import fs from 'node:fs';import pg from 'pg';import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,statement_timeout:60000});await db.connect();
try{
 await db.query('begin');await db.query("set local lock_timeout='10s'");await db.query("select pg_advisory_xact_lock(hashtextextended('finance_entry_log_migration',0))");
 if(!(await db.query("select to_regclass('public.finance_entry_edit_logs') installed")).rows[0].installed){await db.query(fs.readFileSync('supabase/migrations/20261024100000_finance_entry_edit_log.sql','utf8').replace(/^begin;/,'').replace(/commit;\s*$/,''));console.log('Finance entry/edit audit logging enabled for future changes. Historical edits were not fabricated.');}
 else console.log('Finance audit log is already installed.');
 await db.query("notify pgrst,'reload schema'");await db.query('commit');
}catch(error){await db.query('rollback');throw error;}finally{await db.end();}
