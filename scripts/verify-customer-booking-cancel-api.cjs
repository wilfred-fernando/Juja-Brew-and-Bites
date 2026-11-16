const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const id='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222';let signedIn=true,mail=0,booking,failUpdate=false;
const admin={auth:{getUser:async()=>({data:{user:signedIn?{id:owner}:null},error:null})},from:()=>{let update=null,filters=[];const q={select:()=>q,eq:(k,v)=>{filters.push([k,v]);return q;},update:p=>{update=p;return q;},maybeSingle:async()=>{if(!booking||!filters.every(([k,v])=>booking[k]===v))return{data:null,error:null};if(update){if(failUpdate)return{data:null,error:null};Object.assign(booking,update);}return{data:{...booking},error:null};}};return q;}};
const mod={exports:{}};const js=ts.transpileModule(fs.readFileSync('app/api/bookings/cancel/route.js','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInThisContext('(function(require,module,exports){'+js+'\n})')(name=>name==='@supabase/supabase-js'?{createClient:()=>admin}:name==='@/lib/bookings/cancellationEmail'?{sendBookingCancellationEmail:async(a,bookingId)=>{assert.equal(a,admin);assert.equal(bookingId,id);mail++;return{emailSent:true,emailError:''}}}:require(name),mod,mod.exports);
const req=(token=true,extra={})=>new Request('https://example.invalid/api/bookings/cancel',{method:'POST',headers:token?{Authorization:'Bearer test','Content-Type':'application/json'}:{'Content-Type':'application/json'},body:JSON.stringify({bookingId:id,...extra})});
const reset=()=>{mail=0;booking={id,user_id:owner,status:'pending',start_at:'2090-04-10T10:00:00+08:00'};};
(async()=>{
reset();assert.equal((await mod.exports.POST(req(false))).status,401);signedIn=false;assert.equal((await mod.exports.POST(req())).status,401);signedIn=true;
reset();booking.user_id='other';assert.equal((await mod.exports.POST(req(true,{user_id:'other',email:'attacker@example.invalid'}))).status,404);assert.equal(mail,0);
reset();booking.status='confirmed';assert.equal((await mod.exports.POST(req())).status,409);assert.equal(mail,0);
reset();failUpdate=true;assert.equal((await mod.exports.POST(req())).status,409);assert.equal(mail,0);failUpdate=false;
reset();assert.equal((await mod.exports.POST(req(true,{email:'attacker@example.invalid'}))).status,200);assert.equal(booking.status,'cancelled');assert.equal(mail,1);
assert.equal((await mod.exports.POST(req())).status,200);assert.equal(booking.status,'cancelled');
console.log('PASS: customer cancellation requires login and ownership, refuses confirmed/stale updates, sends only after cancellation and ignores forged recipient/account fields. No real email sent.');
})().catch(e=>{console.error(e);process.exitCode=1});
