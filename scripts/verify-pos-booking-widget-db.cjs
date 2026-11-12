require('@next/env').loadEnvConfig(process.cwd());
const {Client} = require('pg');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {randomUUID,randomBytes,createHash} = require('node:crypto');
(async()=>{
  const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});await db.connect();
  const one=async(q,args=[])=>(await db.query(q,args)).rows[0];
  try {
    await db.query('begin'); await db.query("set local lock_timeout='5s'");
    if(!process.argv.includes('--installed')) await db.query(fs.readFileSync('supabase/migrations/20261112100000_pos_booking_widget.sql','utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,''));
    await db.query('savepoint fixtures');
    const actor=await one("select p.id,p.store_id,s.id session_id from profiles p join auth.sessions s on s.user_id=p.id where lower(p.role)='cashier' and p.store_id::text=(select id::text from stores where coalesce(store_name,name,'') ilike '%Pasong Tamo%' limit 1) limit 1");assert.ok(actor);
    const token=randomBytes(32).toString('base64url'), hash=createHash('sha256').update(token).digest('hex'), device=randomUUID();
    await db.query("insert into pos_booking_widget_devices(device_id,user_id,session_id,store_id,token_hash,expires_at) values($1,$2,$3,$4,$5,now()+interval '1 day')",[device,actor.id,actor.session_id,actor.store_id,hash]);
    const data=(await one('select read_pos_booking_widget($1) payload',[hash])).payload;
    assert.ok(Array.isArray(data.bookings));assert.equal(data.store_id,String(actor.store_id));
    const allowed=['id','customer_name','event_type','start_at','end_at','payment_status','package_id','guest_count'].sort();
    for(const b of data.bookings){assert.deepEqual(Object.keys(b).sort(),allowed);assert.ok(new Date(b.end_at)>new Date());}
    const expected=await one("select count(*)::int n from function_room_bookings b where status='confirmed' and end_at>now() and start_at<((date_trunc('month',now() at time zone 'Asia/Manila')+interval '4 months') at time zone 'Asia/Manila') and coalesce(payment_status,'') not in ('expired','cancelled','canceled') and not exists(select 1 from booking_pos_settlements s where s.booking_id=b.id)");
    assert.equal(data.bookings.length,expected.n);
    assert.equal((await one('select read_pos_booking_widget($1) payload',['invalid'])).payload,null);
    await db.query("update pos_booking_widget_devices set expires_at=now()-interval '1 second' where device_id=$1",[device]);assert.equal((await one('select read_pos_booking_widget($1) payload',[hash])).payload,null);
    await db.query("update pos_booking_widget_devices set expires_at=now()+interval '1 day',store_id='wrong-branch' where device_id=$1",[device]);assert.equal((await one('select read_pos_booking_widget($1) payload',[hash])).payload,null);
    await db.query('update pos_booking_widget_devices set store_id=$2 where device_id=$1',[device,String(actor.store_id)]);
    await db.query('savepoint roles');await db.query("update profiles set role='customer' where id=$1",[actor.id]);assert.equal((await one('select read_pos_booking_widget($1) payload',[hash])).payload,null);await db.query('rollback to savepoint roles');
    const temporarySession=randomUUID(); await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[temporarySession,actor.id]);
    await db.query('update pos_booking_widget_devices set session_id=$2 where device_id=$1',[device,temporarySession]);assert.ok((await one('select read_pos_booking_widget($1) payload',[hash])).payload);
    await db.query('delete from auth.sessions where id=$1',[temporarySession]);assert.equal((await one('select read_pos_booking_widget($1) payload',[hash])).payload,null);
    assert.equal((await one("select has_function_privilege('authenticated','public.read_pos_booking_widget(text)','execute') allowed")).allowed,false);
    assert.equal((await one("select has_table_privilege('authenticated','public.pos_booking_widget_devices','select') allowed")).allowed,false);
    await db.query('set constraints all immediate');await db.query('rollback to savepoint fixtures');
    await db.query(process.argv.includes('--apply')?'commit':'rollback');console.log('PASS: staff/session/branch scoped widget, exact upcoming confirmed unsettled projection, expiry, role revocation and no direct customer access; fixtures rolled back. '+(process.argv.includes('--apply')?'Migration installed.':''));
  }catch(e){await db.query('rollback');throw e;}finally{await db.end();}
})().catch(e=>{console.error(e.message,e.where||'');process.exitCode=1});
