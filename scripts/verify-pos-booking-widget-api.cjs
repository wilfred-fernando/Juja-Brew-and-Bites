const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const device='11111111-1111-4111-8111-111111111111',store='22222222-2222-4222-8222-222222222222',user='33333333-3333-4333-8333-333333333333';
const session='44444444-4444-4444-8444-444444444444';
let role='cashier',branch=store,valid=true,posted=null,deleted=null,payload={store_id:store,bookings:[]};
const admin={auth:{getUser:async()=>({data:{user:valid?{id:user}:null},error:null})},from:table=>{
  const q={select:()=>q,eq:(k,v)=>{if(table==='pos_booking_widget_devices'&&k==='token_hash')deleted=v;return q;},
    maybeSingle:async()=>({data:table==='profiles'?{role,store_id:branch}:{id:store},error:null}),
    upsert:async data=>{posted=data;return {error:null}},delete:()=>q,then:resolve=>resolve({error:null})};return q;
},rpc:async()=>({data:payload,error:null})};
const moduleScope={exports:{}};
const source=fs.readFileSync('app/api/pos/booking-widget/route.js','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInThisContext('(function(require,module,exports){'+js+'\n})')(id=>id==='@supabase/supabase-js'?{createClient:()=>admin}:require(id),moduleScope,moduleScope.exports);
const route=moduleScope.exports;
const jwt='x.'+Buffer.from(JSON.stringify({session_id:session})).toString('base64url')+'.x';
const req=(method,token,body)=>new Request('https://pos.jujabrewandbites.com/api/pos/booking-widget',{method,headers:token?{Authorization:'Bearer '+token,'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
(async()=>{
  assert.equal((await route.POST(req('POST',null,{deviceId:device,storeId:store}))).status,401);
  valid=false;assert.equal((await route.POST(req('POST',jwt,{deviceId:device,storeId:store}))).status,401);valid=true;
  role='customer';assert.equal((await route.POST(req('POST',jwt,{deviceId:device,storeId:store}))).status,403);role='cashier';
  branch=device;assert.equal((await route.POST(req('POST',jwt,{deviceId:device,storeId:store}))).status,403);branch=store;
  const provision=await route.POST(req('POST',jwt,{deviceId:device,storeId:store}));assert.equal(provision.status,200);
  const token=(await provision.json()).token;assert.match(token,/^[A-Za-z0-9_-]{43}$/);assert.equal(posted.session_id,session);assert.equal(posted.user_id,user);assert.equal(posted.store_id,store);assert.notEqual(posted.token_hash,token);assert.equal(posted.token_hash.length,64);
  assert.equal((await route.GET(req('GET',null))).status,401);
  const read=await route.GET(req('GET',token));assert.equal(read.status,200);assert.equal(read.headers.get('Cache-Control'),'no-store');assert.deepEqual(await read.json(),payload);
  payload=null;assert.equal((await route.GET(req('GET',token))).status,401);
  assert.equal((await route.DELETE(req('DELETE',token))).status,200);assert.equal(deleted,posted.token_hash);
  for(const file of ['components/pos/PosBookingWidget.jsx','components/pos/BookingReminders.jsx']){
    const result=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});assert.equal(result.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
  }
  console.log('PASS: API staff/session/branch checks, opaque hashed tokens, no-store reads, invalid token expiry, scoped revocation and widget JSX syntax.');
})().catch(e=>{console.error(e);process.exitCode=1});
