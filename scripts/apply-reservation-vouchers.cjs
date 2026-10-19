const {loadEnvConfig}=require('@next/env');
const {Client}=require('pg');
const fs=require('node:fs');
loadEnvConfig(process.cwd());
const files=['20261019090000_booking_reservation_vouchers.sql','20261019091000_reservation_shift_collections.sql'];
async function main(){
  if(!process.argv.includes('--apply')) throw new Error('Pass --apply to install the verified reservation voucher migrations.');
  const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
  await db.connect();
  try{
    await db.query('begin');
    await db.query("set local lock_timeout='10s'");
    await db.query("select pg_advisory_xact_lock(hashtextextended('booking_reservation_voucher_migration',0))");
    for(const file of files){
      const version=file.split('_')[0];
      const installed=(await db.query('select version from supabase_migrations.schema_migrations where version=$1',[version])).rowCount;
      if(installed){ console.log(version+' already installed');continue; }
      const sql=fs.readFileSync('supabase/migrations/'+file,'utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,'');
      await db.query(sql);
      await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[version,file.slice(15,-4),[sql]]);
      console.log('Installed '+file);
    }
    await db.query("notify pgrst,'reload schema'");
    await db.query('commit');
  }catch(error){await db.query('rollback');throw error;}finally{await db.end();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
