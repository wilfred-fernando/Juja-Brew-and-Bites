require('@next/env').loadEnvConfig(process.cwd());
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server'),assert=require('node:assert/strict');
const {Client}=require('pg'),{randomUUID,randomBytes,createHash}=require('node:crypto');
let source=fs.readFileSync('components/pos/BookingCalendarModal.jsx','utf8');
source+='\nexport {monthGrid,WEEKDAYS};';
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};vm.runInThisContext('(function(require,module,exports){'+compiled+'\n})')(id=>id==='@/lib/supabase/client'?{getSupabaseClient:()=>({})}:require(id),mod,mod.exports);
assert.deepEqual(mod.exports.WEEKDAYS,['SUN','MON','TUE','WED','THU','FRI','SAT']);
for(const month of ['2026-11-01','2026-12-01','2028-02-01']) {
  const grid=mod.exports.monthGrid(month);assert.equal(grid.days[0].getUTCDay(),0);assert.equal(grid.days[6].getUTCDay(),6);
  assert.equal(grid.days.length,42);assert.equal((new Date(grid.endISO)-new Date(grid.startISO))/86400000,42);
  if(month==='2026-11-01')assert.equal(grid.startISO,'2026-11-01');
  if(month==='2026-12-01')assert.equal(grid.startISO,'2026-11-29');
  if(month==='2028-02-01')assert.ok(grid.days.some(d=>d.toISOString().startsWith('2028-02-29')));
}
const html=renderToStaticMarkup(React.createElement(mod.exports.default,{open:true,onClose:()=>{}}));
assert.ok(html.indexOf('SUN')<html.indexOf('MON'));
(async()=>{
  const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});await db.connect();
  const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
  try {
    await db.query('begin');await db.query("set local lock_timeout='5s'");
    if(!process.argv.includes('--installed'))await db.query(fs.readFileSync('supabase/migrations/20261113100000_pos_widget_calendar_design.sql','utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,''));
    await db.query('savepoint fixtures');
    const actor=await one("select p.id,p.store_id,s.id session_id from profiles p join auth.sessions s on s.user_id=p.id where lower(p.role)='cashier' and p.store_id::text=(select id::text from stores where coalesce(store_name,name,'') ilike '%Pasong Tamo%' limit 1) limit 1");assert.ok(actor);
    const device=randomUUID(),hash=createHash('sha256').update(randomBytes(32)).digest('hex');
    await db.query("insert into pos_booking_widget_devices(device_id,user_id,session_id,store_id,token_hash,expires_at) values($1,$2,$3,$4,$5,now()+interval '1 day')",[device,actor.id,actor.session_id,actor.store_id,hash]);
    const old=(await one('select read_pos_booking_widget($1) data',[hash])).data;
    const data=(await one('select read_pos_booking_calendar_widget($1) data',[hash])).data;
    assert.equal(data.store_id,old.store_id);const ids=new Set(data.bookings.map(b=>b.id));assert.equal(ids.size,data.bookings.length);
    for(const b of old.bookings)assert.ok(ids.has(b.id),'v2.3 confirmed booking remains available');
    const expectedFields=['id','customer_name','event_type','business_date','status','start_at','end_at','payment_status','package_id','package_name','guest_count'].sort();
    for(const b of data.bookings){assert.deepEqual(Object.keys(b).sort(),expectedFields);assert.ok(['pending','confirmed'].includes(b.status));assert.match(b.business_date,/^\d{4}-\d{2}-\d{2}$/);}
    const pending=await one("select count(*)::int n from function_room_bookings b where status='pending' and end_at>now() and start_at<((date_trunc('month',now() at time zone 'Asia/Manila')+interval '4 months 14 days') at time zone 'Asia/Manila') and coalesce(payment_status,'') not in ('expired','cancelled','canceled') and not(payment_status='waiting_for_payment' and payment_proof_url is null and created_at<=now()-interval '24 hours') and not exists(select 1 from booking_pos_settlements s where s.booking_id=b.id)");
    assert.equal(data.bookings.filter(b=>b.status==='pending').length,pending.n);
    assert.equal((await one("select read_pos_booking_calendar_widget('invalid') data")).data,null);
    await db.query("update pos_booking_widget_devices set expires_at=now()-interval '1 second' where device_id=$1",[device]);assert.equal((await one('select read_pos_booking_calendar_widget($1) data',[hash])).data,null);
    assert.equal((await one("select has_function_privilege('authenticated','public.read_pos_booking_calendar_widget(text)','execute') allowed")).allowed,false);
    await db.query('set constraints all immediate');await db.query('rollback to savepoint fixtures');await db.query(process.argv.includes('--apply')?'commit':'rollback');
    console.log('PASS: POS Sunday-first rendered header, month boundaries and leap year; pending/confirmed card projection, business dates, old-feed compatibility and scoped access. '+(process.argv.includes('--apply')?'Migration installed.':'Fixtures and migration rolled back.'));
  }catch(e){await db.query('rollback');throw e;}finally{await db.end();}
})().catch(e=>{console.error(e.message,e.where||'');process.exitCode=1});
