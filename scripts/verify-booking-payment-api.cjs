const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
let guardResponse=null,calls=0,rpcError=null;
const id='11111111-1111-4111-8111-111111111111';
const moduleFixture={exports:{}};
const code=ts.transpileModule(fs.readFileSync('app/api/admin/booking-payment/route.js','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(()=>({requireAdminApi:async()=>guardResponse?{response:guardResponse}:{user:{id:'verified-admin'},admin:{rpc:async(name,args)=>{calls++;assert.equal(name,'admin_set_booking_payment');assert.equal(args.p_actor,'verified-admin');return {data:{booking:{id,payment_status:'approved'}},error:rpcError};}}}}),moduleFixture,moduleFixture.exports);
const request=body=>new Request('https://example.invalid/api/admin/booking-payment',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
(async()=>{
for(const status of [401,403]){guardResponse=Response.json({error:'Denied'},{status});assert.equal((await moduleFixture.exports.POST(request({bookingId:id,paymentStatus:'approved'}))).status,status);}
guardResponse=null;assert.equal(calls,0);
for(const body of [null,{}, {bookingId:'invalid',paymentStatus:'approved'}, {bookingId:id,paymentStatus:'paid'}])assert.equal((await moduleFixture.exports.POST(request(body))).status,400);
assert.equal(calls,0);assert.equal((await moduleFixture.exports.POST(request({bookingId:id,paymentStatus:'approved',actor:'forged-user'}))).status,200);assert.equal(calls,1);
rpcError={message:'Open an online shift'};assert.equal((await moduleFixture.exports.POST(request({bookingId:id,paymentStatus:'approved'}))).status,400);
console.log('Booking payment API login/role guard, validation, verified actor attribution, RPC errors and no-email code path passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
