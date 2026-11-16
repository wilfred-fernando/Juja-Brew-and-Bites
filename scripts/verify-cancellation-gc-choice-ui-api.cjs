const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const root=process.cwd(),id='11111111-1111-4111-8111-111111111111';
function load(file,fixture,cache=new Map()) {
  if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);let source=fs.readFileSync(file,'utf8');
  if(file===path.join(root,'app/admin/bookings/page.jsx')) {
    const booking={id,customer_name:'Render Test',business_date:fixture.december?'2089-12-10':'2089-04-10',start_at:'2089-04-10T10:00:00+08:00',status:fixture.type==='cancel'?'confirmed':'cancellation_requested',payment_status:'approved',payment_method:'QRPH',deposit_amount:1000};
    const modal={type:fixture.type,booking:fixture.type==='approve_bulk'?undefined:booking,ids:[id],gcChoice:fixture.choice};
    source=source.replace('const [isSuperAdmin, setIsSuperAdmin] = useState(false);',`const [isSuperAdmin,setIsSuperAdmin]=useState(${fixture.superAdmin});`)
      .replace('const [actionModal, setActionModal] = useState(null);',`const [actionModal,setActionModal]=useState(${JSON.stringify(modal)});`)
      .replace('const [loading, setLoading] = useState(true);','const [loading,setLoading]=useState(false);')
      .replace('const [bookings, setBookings] = useState([]);',`const [bookings,setBookings]=useState(${JSON.stringify([booking])});`);
  }
  const js=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},fileName:file.replace(/\.mjs$/,'.js')}).outputText;
  const req=name=>{
    if(name==='@/lib/supabase/client')return{getSupabaseClient:()=>({})};if(name.startsWith('@/components/'))return{__esModule:true,default:()=>null};
    if(name.startsWith('@/')||name.startsWith('.')) {const base=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(file),name);const resolved=[base,base+'.js',base+'.jsx',base+'.mjs',path.join(base,'index.js')].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());if(!resolved)throw Error(name);return load(resolved,fixture,cache);}return require(name);
  };vm.runInThisContext('(function(require,module,exports){'+js+'\n})')(req,module,module.exports);return module.exports;
}
for(const type of ['cancel','approve','approve_bulk'])for(const superAdmin of [false,true])for(const december of [false,true])for(const choice of ['', 'generate','forfeit']) {
  const component=load(path.join(root,'app/admin/bookings/page.jsx'),{type,superAdmin,december,choice}).default;
  const html=renderToStaticMarkup(React.createElement(component));const visible=superAdmin&&!december;
  assert.equal(html.includes('id="cancellation-gc-choice"'),visible);
  const confirm=html.match(/<button[^>]*>Confirm<\/button>/)?.[0];assert.ok(confirm);assert.equal(/\sdisabled(?:=|\s|>)/.test(confirm),visible&&!choice);
  if(visible&&choice==='forfeit')assert.match(html,/No GC will be issued/);
}
let role='super_admin',signedIn=true,calls=[],rpcError=null;
const user={id:'22222222-2222-4222-8222-222222222222'};
const admin={from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{role},error:null})};return q;},rpc:async(name,args)=>{calls.push({name,args});return{data:{id,status:'cancelled'},error:rpcError}}};
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.invalid';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
const mod={exports:{}};const js=ts.transpileModule(fs.readFileSync('app/api/admin/booking-cancellation-gift-certificate/route.js','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInThisContext('(function(require,module,exports){'+js+'\n})')(name=>{
  if(name==='@supabase/ssr')return{createServerClient:()=>({auth:{getUser:async()=>({data:{user:signedIn?user:null},error:null})}})};
  if(name==='@supabase/supabase-js')return{createClient:()=>admin};if(name==='next/headers')return{cookies:async()=>({getAll:()=>[]}),headers:async()=>({get:()=>''})};if(name==='@/lib/bookings/cancellationEmail')return{sendBookingCancellationEmail:async()=>({emailSent:true,emailError:''})};if(name.startsWith('@/'))return{};return require(name);
},mod,mod.exports);
const request=body=>new Request('https://example.invalid/api/admin/booking-cancellation-gift-certificate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
(async()=>{
  signedIn=false;assert.equal((await mod.exports.POST(request({bookingId:id,action:'admin_cancel',generateGc:false}))).status,401);signedIn=true;
  for(const r of ['cashier','admin']){role=r;assert.equal((await mod.exports.POST(request({bookingId:id,action:'admin_cancel',generateGc:false}))).status,403);}role='super_admin';assert.equal(calls.length,0);
  assert.equal((await mod.exports.POST(request({bookingId:id,action:'admin_cancel',generateGc:'false'}))).status,400);
  for(const generateGc of [false,true])assert.equal((await mod.exports.POST(request({bookingId:id,action:'admin_cancel',generateGc,actor:'forged'}))).status,200);
  assert.equal(calls[0].name,'super_admin_cancel_booking');assert.equal(calls[0].args.p_actor,user.id);assert.equal(calls[0].args.p_generate_gc,false);assert.equal(calls[1].args.p_generate_gc,true);
  rpcError={message:'December cancellation fees are forfeited'};assert.equal((await mod.exports.POST(request({bookingId:id,action:'cancel',generateGc:true}))).status,409);assert.equal(calls.at(-1).args.p_only_requested,true);
  console.log('PASS: rendered Super Admin-only choices for direct/request/bulk cancellation, required selection, December exclusion; API verified actor, role/boolean validation and safe RPC failures.');
})().catch(e=>{console.error(e);process.exitCode=1});
