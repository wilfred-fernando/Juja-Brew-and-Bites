const {loadEnvConfig}=require('@next/env');
const {Client}=require('pg');
const fs=require('node:fs');
loadEnvConfig(process.cwd());
async function main(){
  if(!process.argv.includes('--apply'))throw new Error('Pass --apply to install the verified receipt fix.');
  const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
  await db.connect();try{
    await db.query('begin');await db.query("set local lock_timeout='10s'");
    await db.query("select pg_advisory_xact_lock(hashtextextended('booking_reservation_voucher_migration',0))");
    const installed=(await db.query("select to_regprocedure('public.ensure_booking_reservation_receipt(uuid,text,uuid)') installed")).rows[0].installed;
    if(!installed)await db.query(fs.readFileSync('supabase/migrations/20261019120000_booking_fee_receipts.sql','utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,''));
    const index=process.argv.indexOf('--repair-booking');
    let receipt;
    if(index>=0){
      const id=process.argv[index+1];
      if(!/^[0-9a-f-]{36}$/i.test(id||''))throw new Error('Pass the specific verified booking UUID.');
      const b=(await db.query("select id from public.function_room_bookings where id=$1 and status='confirmed' and payment_status='approved' and deposit_amount>0 and (created_at at time zone 'Asia/Manila')::date=(now() at time zone 'Asia/Manila')::date for update",[id])).rows[0];
      if(!b)throw new Error('Target booking is not a newly approved paid booking from today; review before repairing.');
      receipt=(await db.query('select public.ensure_booking_reservation_receipt($1) receipt',[id])).rows[0].receipt;
      const order=(await db.query('select receipt_number,total,payment_method,store_id from public.orders where id=$1',[receipt.collection_order_id])).rows[0];
      console.log('Booking fee receipt ready:',JSON.stringify(order));
    }
    await db.query('set constraints all immediate');
    await db.query("notify pgrst,'reload schema'");await db.query('commit');
    console.log(installed?'Receipt migration already installed.':'Receipt migration installed.');
  }catch(error){await db.query('rollback');throw error;}finally{await db.end();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
