const { loadEnvConfig } = require('@next/env');
const { Client } = require('pg');
const fs = require('node:fs');
loadEnvConfig(process.cwd());

async function main() {
  const apply = process.argv.includes('--apply');
  const files = ['20261112090000_juja_tumbler_stamps.sql','20261112100000_juja_tumbler_25_stamps.sql','20261113090000_stamp_drinks_no_loyalty_points.sql','20261113100000_stamp_eligibility_refunds_duplicates.sql','20261114090000_reschedule_juja_stamps_nov20.sql'];
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='10s'");
    await db.query("select pg_advisory_xact_lock(hashtextextended('juja_tumbler_stamp_migration',0))");
    const history = Boolean((await db.query("select to_regclass('supabase_migrations.schema_migrations') registry")).rows[0].registry);
    const migrations = [];
    for (const file of files) {
    const version = file.split('_')[0];
    const installed = history
      ? (await db.query('select version from supabase_migrations.schema_migrations where version=$1',[version])).rowCount
      : (await db.query(`select case when to_regprocedure('public.refresh_juja_stamp_card(uuid)') is null then false
        when $1='20261112090000' then true
        when $1='20261113090000' then to_regprocedure('public.juja_points_after_stamp_exclusion(uuid,text,uuid,numeric)') is not null
        when $1='20261113100000' then to_regprocedure('public.juja_stamp_line_quantity(jsonb)') is not null
        when $1='20261114090000' then position('2026-11-20' in pg_get_functiondef('public.join_juja_stamp_card(uuid)'::regprocedure))>0
        else position('signatures = 5 and drinks = 20' in pg_get_functiondef('public.refresh_juja_stamp_card(uuid)'::regprocedure))>0 end installed`,[version])).rows[0].installed;
    if (!installed) {
      const sql = fs.readFileSync('supabase/migrations/'+file,'utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,'');
      await db.query(sql);
      if (history) await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[version,file.slice(15,-4),[sql]]);
    }
    migrations.push({version,alreadyInstalled:Boolean(installed)});
    }
    const categories = (await db.query('select stamp_kind,count(*)::int categories from public.juja_stamp_categories group by stamp_kind order by stamp_kind')).rows;
    if (!categories.some(row=>row.stamp_kind==='signature' && row.categories===1) || !categories.some(row=>row.stamp_kind==='drink' && row.categories>0)) throw Error('Expected signature and drink categories were not configured.');
    const permissions = (await db.query(`select
      has_function_privilege('authenticated','public.join_juja_stamp_card(uuid)','execute') can_join,
      has_function_privilege('anon','public.join_juja_stamp_card(uuid)','execute') anonymous_join,
      has_function_privilege('authenticated','public.refresh_juja_stamp_card(uuid)','execute') direct_refresh`)).rows[0];
    if (!permissions.can_join || permissions.anonymous_join || permissions.direct_refresh) throw Error('Unexpected stamp RPC permissions.');
    console.log(JSON.stringify({ mode: apply?'apply':'dry-run rollback', migrations, categories, permissions }));
    if (apply) {
      await db.query("notify pgrst,'reload schema'");
      await db.query('commit');
      console.log('JUJA stamp migration committed.');
    } else {
      await db.query('rollback');
      console.log('Dry run rolled back; no live changes.');
    }
  } catch (error) {
    await db.query('rollback');
    throw error;
  } finally { await db.end(); }
}
main().catch(error=>{ console.error(error.message); process.exitCode=1; });
