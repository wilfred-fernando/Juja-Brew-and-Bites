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
 if (process.argv.includes('--petty')) {
  const installed = (await db.query("select to_regprocedure('public.finance_sync_petty_cash_row(text,jsonb,boolean)') installed")).rows[0].installed;
  if (!installed) {
   const pettySql = fs.readFileSync('supabase/migrations/20261002110000_finance_petty_cash_ledger.sql', 'utf8').replace(/^begin;/, '').replace(/commit;\s*$/, '');
   await db.query(pettySql);
   console.log('Petty cash ledger integration installed and existing records imported.');
  } else console.log('Petty cash ledger integration already installed.');
 }
 if (process.argv.includes('--position')) {
  const installed = (await db.query("select to_regprocedure('public.finance_cash_position_snapshot(date,date)') installed")).rows[0].installed;
  if (!installed) {
   await db.query(fs.readFileSync('supabase/migrations/20261004120000_finance_cash_position_controls.sql', 'utf8').replace(/^begin;/, '').replace(/commit;\s*$/, ''));
   console.log('Cash-position controls and payment queue installed.');
  } else console.log('Cash-position controls already installed.');
 }
 await db.query("notify pgrst, 'reload schema'");
 await db.query('commit');
 console.log('Supabase schema-cache reload requested.');
 const result = await db.query("select to_regprocedure('public.finance_cash_snapshot(date,date)')::text function, (select count(*) from public.finance_cash_accounts)::int accounts");
 console.log(JSON.stringify(result.rows[0]));
} catch (error) { await db.query('rollback'); throw error; }
finally { await db.end(); }
