const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
let ready=true,sends=0,throwSmtp=false,row,batch={status:'pending_approval'};
const booking={id:'11111111-1111-4111-8111-111111111111',customer_name:'<Customer>',email:'customer@example.invalid',reference_code:'JUJA-TEST',business_date:'2089-04-10',start_at:'2089-04-10T10:00:00+08:00',end_at:'2089-04-10T13:00:00+08:00',package_id:1,event_type:'Birthday',status:'cancelled'};
const admin={from:table=>{
  let patch=null,filters=[],allowed=null,selected=false;const q={update:p=>{patch=p;return q},eq:(k,v)=>{filters.push([k,v]);return q},in:(k,v)=>{allowed=[k,v];return q},select:()=>{selected=true;return q}};
  const run=()=>{if(table==='booking_gc_batches')return {data:batch,error:null};let match=row&&filters.every(([k,v])=>row[k]===v)&&(!allowed||allowed[1].includes(row[allowed[0]]));if(!match)return {data:null,error:null};if(patch)Object.assign(row,patch);return {data:selected?structuredClone(row):null,error:null};};
  q.maybeSingle=async()=>run();q.then=resolve=>resolve(run());return q;
}};
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const moduleFixture={exports:{}};
const code=ts.transpileModule(fs.readFileSync('lib/bookings/cancellationEmail.js','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(name=>{
  if(name==='@/lib/email/notifications')return {escapeEmailHtml:escape,getEmailConfigStatus:()=>({ready}),sendNotificationEmail:async message=>{sends++;assert.equal(message.to,booking.email);assert.match(message.subject,/Booking Cancellation/);if(throwSmtp)throw Error('Uncertain SMTP result');return {sent:true}}};
  if(name==='@/lib/dateFormat')return{formatDateTime:v=>v};if(name==='@/lib/bookings/decemberPolicy.mjs')return{isDecemberBooking:b=>b.business_date.slice(5,7)==='12'};return require(name);
},moduleFixture,moduleFixture.exports);
const {sendBookingCancellationEmail:send,bookingCancellationHtml:html}=moduleFixture.exports;
const reset=(changes={})=>{row={booking_id:booking.id,status:'pending',booking_snapshot:{...booking,...changes}};sends=0;ready=true;throwSmtp=false;};
(async()=>{
  reset();const results=await Promise.all([send(admin,booking.id),send(admin,booking.id)]);assert.equal(sends,1);assert.ok(results.some(r=>r.emailSent));assert.equal(row.status,'sent');await send(admin,booking.id);assert.equal(sends,1);
  assert.match(html(booking,batch),/subject to separate approval/);assert.match(html(booking,batch),/&lt;Customer&gt;/);assert.doesNotMatch(html(booking,batch),/<Customer>/);
  for(const b of [{...booking,business_date:'2089-12-10'},{...booking,cancellation_gc_choice:'forfeit'}]){const content=html(b,batch);assert.match(content,/forfeited/);assert.doesNotMatch(content,/queued for gift certificate/);}
  assert.match(html(booking,{status:'approved'}),/has been approved/);assert.doesNotMatch(html(booking,null),/has been approved/);
  reset();ready=false;assert.equal((await send(admin,booking.id)).emailSent,false);assert.equal(row.status,'failed');assert.equal(sends,0);ready=true;await send(admin,booking.id);assert.equal(row.status,'sent');assert.equal(sends,1);
  reset({email:''});await send(admin,booking.id);assert.equal(sends,0);assert.equal(row.status,'failed');
  reset({email:'customer@example.invalid,other'});await send(admin,booking.id);assert.equal(sends,0);assert.equal(row.status,'failed');
  reset();throwSmtp=true;assert.equal((await send(admin,booking.id)).emailSent,false);assert.equal(row.status,'sending');await send(admin,booking.id);assert.equal(sends,1);
  for(const file of ['components/BookingForm.jsx','app/api/bookings/cancel/route.js','app/api/admin/booking-confirmation/route.js']){const result=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});assert.equal(result.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);}
  console.log('PASS: customer cancellation copy, escaped details, December/forfeit/GC messaging, concurrent claim and sent deduplication, known failure retry, uncertain delivery no-resend, and changed flow syntax. No real email sent.');
})().catch(e=>{console.error(e);process.exitCode=1});
