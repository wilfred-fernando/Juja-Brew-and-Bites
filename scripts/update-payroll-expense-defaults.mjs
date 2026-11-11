import fs from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,statement_timeout:60000});
await db.connect();
try {
 await db.query('begin');await db.query("set local lock_timeout='10s'");
 await db.query('lock table public.finance_expenses in share row exclusive mode');
 const admin=(await db.query("select id from profiles where lower(role)='super_admin' limit 1")).rows[0].id;
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[admin]);
 const fingerprint=async linked=>(await db.query("select md5(coalesce(string_agg(md5((to_jsonb(e)-$1::text[])::text),'' order by id),'')) hash from finance_expenses e where (payroll_entry_id is not null)=$2",[linked?['tax_type','payment_type','vatable_sales','vat_amount','updated_at']:[],linked])).rows[0].hash;
 const excluded=await fingerprint(false),preserved=await fingerprint(true);
 const before=(await db.query("select count(*)::int total,count(*) filter(where tax_type is distinct from 'AR' or payment_type is distinct from 'CASH')::int changed from finance_expenses where payroll_entry_id is not null")).rows[0];
 await db.query(fs.readFileSync('supabase/migrations/20261111120000_payroll_salary_ar_cash.sql','utf8').replace(/^begin;/,'').replace(/commit;\s*$/,''));
 assert.equal(await fingerprint(false),excluded,'Unrelated expenses must remain identical');
 assert.equal(await fingerprint(true),preserved,'Payroll expense amounts, dates and linkage must remain identical');
 assert.equal((await db.query("select count(*)::int n from finance_expenses where payroll_entry_id is not null and (tax_type is distinct from 'AR' or payment_type is distinct from 'CASH')")).rows[0].n,0);
 assert.equal((await db.query("select tgenabled from pg_trigger where tgrelid='public.finance_expenses'::regclass and tgname='finance_salary_expense_guard'")).rows[0].tgenabled,'O');
 const verify=process.argv.includes('--verify');await db.query(verify?'rollback':'commit');
 console.log(JSON.stringify({mode:verify?'rollback rehearsal':'committed',payroll_expenses:before.total,updated:before.changed,other_expenses_unchanged:true,amounts_dates_links_preserved:true}));
} catch(error){await db.query('rollback');throw error;} finally{await db.end();}
