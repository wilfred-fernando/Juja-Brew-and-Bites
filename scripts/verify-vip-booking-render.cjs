// Render the actual POS page through React, with network/native side effects
// disabled. Exercise the conditional VIP branch that a build does not execute.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const assert=require('node:assert/strict');
const root=process.cwd(), cache=new Map();
const client={};
function load(file){
  if(cache.has(file))return cache.get(file).exports;
  const module={exports:{}}; cache.set(file,module);
  let source=fs.readFileSync(file,'utf8');
  if(file===path.join(root,'app/pos/page.jsx')){
    source=source.replace('const [diningOptions, setDiningOptions] = useState([])',
      'const [diningOptions, setDiningOptions] = useState([{id:"__vip_booking",name:"VIP Booking"}])');
    source=source.replace('const [diningOption, setDiningOption] = useState("")',
      'const [diningOption, setDiningOption] = useState("__vip_booking")');
    if(process.argv.includes('--selected')){
      const id='11111111-1111-4111-8111-111111111111';
      source=source.replace('const [confirmedBookings, setConfirmedBookings] = useState([])',
        `const [confirmedBookings, setConfirmedBookings] = useState(${JSON.stringify([{id,customer_name:'Render Test',business_date:'2026-11-01',start_at:'2026-11-01T10:00:00+08:00',package_id:1,voucher:{amount:1000,code:'TEST',collection_receipt_number:'TEST-RECEIPT'}}])})`);
      source=source.replace('const [grabOrderNumber, setGrabOrderNumber] = useState("")',`const [grabOrderNumber, setGrabOrderNumber] = useState("${id}")`);
    }
  }
  source=source.replace('const [loading, setLoading] = useState(true)', 'const [loading, setLoading] = useState(false)');
  source=source.replace('const [isMounted, setIsMounted] = useState(false)', 'const [isMounted, setIsMounted] = useState(true)');
  source=source.replace('const [shiftStatus, setShiftStatus] = useState("loading")', 'const [shiftStatus, setShiftStatus] = useState("open")');
  const output=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},fileName:file.replace(/\.mjs$/,'.js')}).outputText;
  const customRequire=id=>{
    if(id==='@/lib/supabase/client')return {getSupabaseClient:()=>client};
    if(id.startsWith('@/components/')&&!['@/components/pos/TicketPanel','@/components/pos/BookingReservationSelector'].includes(id))return {__esModule:true,default:()=>null};
    if(id.startsWith('@/')||id.startsWith('.')){
      const base=id.startsWith('@/')?path.join(root,id.slice(2)):path.resolve(path.dirname(file),id);
      const resolved=[base,base+'.js',base+'.jsx',base+'.mjs',path.join(base,'index.js')].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
      if(!resolved)throw new Error('Cannot resolve '+id+' from '+file);
      return load(resolved);
    }
    return require(id);
  };
  vm.runInThisContext('(function(require,module,exports){'+output+'\n})',{filename:file})(customRequire,module,module.exports);
  return module.exports;
}
const POSPage=load(path.join(root,'app/pos/page.jsx')).default;
const html=renderToStaticMarkup(React.createElement(POSPage));
assert.match(html,/Confirmed booking/);
assert.match(html,/Select a confirmed booking/);
assert.doesNotMatch(html,/Application error/);
if(process.argv.includes('--selected'))assert.match(html,/Fee receipt: TEST-RECEIPT/);
console.log('Actual POS VIP Booking render passed: selector visible without application error.');
