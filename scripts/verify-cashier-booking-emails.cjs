const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
const booking={id:'test-booking',customer_name:'Test Customer',email:'customer@example.invalid',status:'pending',start_at:'2080-01-01T10:00:00+08:00',end_at:'2080-01-01T13:00:00+08:00',package_id:1,payment_method:'Cash',deposit_amount:1000};
let role='cashier',saved={...booking},mails=[],failMail=false;
const client={auth:{getUser:async()=>({data:{user:{id:'staff'}}})},from(table){
  let updating=false,payload;
  const chain={select(){return chain},eq(){return chain},update(p){updating=true;payload=p;return chain},async maybeSingle(){
    if(table==='profiles')return {data:{role}};
    if(table==='function_room_packages')return {data:{name:'Package 1'}};
    if(updating){if(saved.status!=='pending')return {data:null};saved={...saved,...payload};}
    return {data:{...saved}};
  }};return chain;
},async rpc(name,{data}){assert.equal(data.status,'pending');assert.equal(data.payment_status,'cash_pending');saved={...booking,...data};return {data:saved};}};
function load(file){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const requireMock=id=>{
  if(id==='@supabase/supabase-js')return {createClient:()=>client};
  if(id==='@supabase/ssr')return {createServerClient:()=>client};
  if(id==='next/headers')return {cookies:async()=>({getAll:()=>[]}),headers:async()=>new Headers()};
  if(id==='@/lib/email/notifications')return {notificationRecipient:()=> 'admin@example.invalid',sendNotificationEmail:async mail=>{mails.push(mail);if(failMail)throw Error('Mock SMTP unavailable');return {sent:true};}};
  if(id==='@/lib/bookings/confirmationEmail')return {confirmationHtml:()=> 'approved template'};
  if(id==='@/lib/bookings/updateEmails')return {bookingUpdatedCustomerHtml:()=> 'updated template'};
  if(id==='@/lib/bookings/cashierReviewEmails')return {cashierBookingAdminHtml:()=> 'review template',bookingRejectedHtml:()=> 'rejected template'};
  throw Error(id);
};vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(requireMock,module,module.exports);return module.exports;}
(async()=>{
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.invalid';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
 const manual=load('app/api/bookings/manual/route.js');
 let result=await manual.POST(new Request('https://example.invalid',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify({...booking,status:'confirmed',payment_status:'approved'})}));
 assert.equal(result.status,200);let body=await result.json();assert.equal(body.booking.status,'pending');assert.equal(body.emailDeferred,true);assert.equal(body.adminEmailSent,true);assert.equal(mails.length,1);assert.equal(mails[0].to,'admin@example.invalid');
 const review=load('app/api/admin/booking-confirmation/route.js');
 const request=action=>new Request('https://example.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bookingId:booking.id,action})});
 mails=[];result=await review.POST(request('approve'));assert.equal(result.status,403);assert.equal(mails.length,0);
 role='admin';result=await review.POST(request('approve'));assert.equal(result.status,200);assert.equal(mails.length,1);assert.equal(mails[0].to,booking.email);assert.match(mails[0].subject,/Confirmed/);
 result=await review.POST(request('approve'));assert.equal(result.status,409);assert.equal(mails.length,1);
 saved={...booking};mails=[];result=await review.POST(request('reject'));assert.equal(result.status,200);assert.equal(saved.status,'cancelled');assert.equal(mails[0].to,booking.email);assert.match(mails[0].subject,/Not Approved/);
 result=await review.POST(request('reject'));assert.equal(result.status,409);assert.equal(mails.length,1);
 saved={...booking};mails=[];failMail=true;result=await review.POST(request('reject'));body=await result.json();assert.equal(result.status,200);assert.equal(body.emailSent,false);assert.equal(saved.status,'cancelled');
 console.log('Cashier/admin email routing, authorization, duplicate decision and SMTP failure checks passed. No real emails sent.');
})().catch(e=>{console.error(e);process.exitCode=1});

