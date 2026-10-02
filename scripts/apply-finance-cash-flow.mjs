import fs from 'node:fs';
import pg from 'pg';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000, statement_timeout: 60000 });
await db.connect();
try {
 await db.query('begin');
 await db.query("set local lock_timeout = '10s'");
 await db.query("select pg_advisory_xact_lock(hashtextextended('finance_cash_flow_migration', 0))");
 const { rows } = await db.query("select to_regclass('public.finance_cash_accounts') accounts, to_regprocedure('public.finance_cash_snapshot(date,date)') snapshot");
 if (!rows[0].accounts && !rows[0].snapshot) {
  const sql = fs.readFileSync('supabase/migrations/20261002090000_finance_cash_flow.sql', 'utf8').replace(/^begin;/, '').replace(/commit;\s*$/, '');
  await db.query(sql);
  console.log('Cash-flow migration installed.');
 } else if (!rows[0].accounts || !rows[0].snapshot) {
  throw new Error('Partial cash-flow schema detected; migration was not applied.');
 } else console.log('Cash-flow schema already installed.');
 await db.query("notify pgrst, 'reload schema'");
 await db.query('commit');
 console.log('Supabase schema-cache reload requested.');
 const result = await db.query("select to_regprocedure('public.finance_cash_snapshot(date,date)')::text function, (select count(*) from public.finance_cash_accounts)::int accounts");
 console.log(JSON.stringify(result.rows[0]));
} catch (error) { await db.query('rollback'); throw error; }
finally { await db.end(); }
