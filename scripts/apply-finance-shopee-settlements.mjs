import fs from 'node:fs';import pg from 'pg';import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,statement_timeout:60000});await db.connect();
try{
 await db.query('begin');await db.query("set local lock_timeout='10s'");await db.query("select pg_advisory_xact_lock(hashtextextended('finance_shopee_settlement_migration',0))");
 if(!(await db.query("select to_regprocedure('public.finance_shopee_settlement(numeric,numeric)') installed")).rows[0].installed){await db.query(fs.readFileSync('supabase/migrations/20261024110000_finance_shopee_settlements.sql','utf8').replace(/^begin;/,'').replace(/commit;\s*$/,''));console.log('ShopeeFood settlement computation installed. Existing remittances were not rewritten.');}
 else console.log('ShopeeFood settlement schema already installed.');
 await db.query("notify pgrst,'reload schema'");await db.query('commit');
}catch(error){await db.query('rollback');throw error;}finally{await db.end();}
