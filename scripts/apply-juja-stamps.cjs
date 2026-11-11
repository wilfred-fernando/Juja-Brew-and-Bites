const { loadEnvConfig } = require('@next/env');
const { Client } = require('pg');
const fs = require('node:fs');
loadEnvConfig(process.cwd());

async function main() {
  const apply = process.argv.includes('--apply');
  const file = '20261112090000_juja_tumbler_stamps.sql';
  const version = file.split('_')[0];
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='10s'");
    await db.query("select pg_advisory_xact_lock(hashtextextended('juja_tumbler_stamp_migration',0))");
    const history = Boolean((await db.query("select to_regclass('supabase_migrations.schema_migrations') registry")).rows[0].registry);
    const installed = history && (await db.query('select version from supabase_migrations.schema_migrations where version=$1',[version])).rowCount;
    if (!installed) {
      const sql = fs.readFileSync('supabase/migrations/'+file,'utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,'');
      await db.query(sql);
      if (history) await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[version,'juja_tumbler_stamps',[sql]]);
    }
    const categories = (await db.query('select stamp_kind,count(*)::int categories from public.juja_stamp_categories group by stamp_kind order by stamp_kind')).rows;
    if (!categories.some(row=>row.stamp_kind==='signature' && row.categories===1) || !categories.some(row=>row.stamp_kind==='drink' && row.categories>0)) throw Error('Expected signature and drink categories were not configured.');
    const permissions = (await db.query(`select
      has_function_privilege('authenticated','public.join_juja_stamp_card(uuid)','execute') can_join,
      has_function_privilege('anon','public.join_juja_stamp_card(uuid)','execute') anonymous_join,
      has_function_privilege('authenticated','public.refresh_juja_stamp_card(uuid)','execute') direct_refresh`)).rows[0];
    if (!permissions.can_join || permissions.anonymous_join || permissions.direct_refresh) throw Error('Unexpected stamp RPC permissions.');
    console.log(JSON.stringify({ mode: apply?'apply':'dry-run rollback', alreadyInstalled: Boolean(installed), categories, permissions }));
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
