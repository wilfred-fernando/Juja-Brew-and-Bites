const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const babel=require('next/dist/compiled/babel/core');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const source=fs.readFileSync('components/pos/TicketPanel.jsx','utf8');
const code=babel.transformSync(source,{filename:'TicketPanel.jsx',presets:['next/babel'],babelrc:false,configFile:false}).code;
const moduleObject={exports:{}};
vm.runInNewContext(code,{module:moduleObject,exports:moduleObject.exports,require:name=>{
  if(name==='@/lib/posDiscountBeneficiaries') return {beneficiaryResidencyLabel:()=>'',beneficiaryTypeLabel:()=>''};
  if(name==='@/lib/posLoyaltySearch') return {normalizeLoyaltySearch:value=>String(value||''),matchesLoyaltySearch:()=>false};
  return require(name);
}});
const TicketPanel=moduleObject.exports.default;
const props={cart:[{cartItemId:'test',name:'Coffee',quantity:1,unitPrice:100}],customers:[],customerSearch:'',diningOptions:[],
  onOpenPosMenu:()=>{},onOpenShift:()=>{}};
const closed=renderToStaticMarkup(React.createElement(TicketPanel,{...props,ticketLocked:true}));
assert.match(closed,/<fieldset[^>]*disabled=""[^>]*inert=""/);
const menu=closed.match(/<button[^>]*aria-label="Open POS menu"[^>]*>/)?.[0];
assert(menu);
assert(!menu.includes('disabled'),'POS menu remains enabled');
assert(closed.indexOf(menu)<closed.indexOf('<fieldset'),'Menu is outside the disabled ticket body');
assert.match(closed,/>Open Shift<\/button>/);
assert.match(closed,/<button[^>]*disabled=""[^>]*>Save Ticket<\/button>/);
assert.match(closed,/<button[^>]*disabled=""[^>]*>Charge<\/button>/);
const open=renderToStaticMarkup(React.createElement(TicketPanel,{...props,ticketLocked:false}));
assert.doesNotMatch(open,/<fieldset[^>]*disabled/);
assert.doesNotMatch(open,/Shift closed\./);
const openSave=open.match(/<button[^>]*>Save Ticket<\/button>/)?.[0];
assert(openSave && !/\sdisabled(?:=|\s|>)/.test(openSave),'Reopening enables Save Ticket');
const page=fs.readFileSync('app/pos/page.jsx','utf8');
const start=page.indexOf('const requireOpenTicketShift = () => {');
const end=page.indexOf('\n  };',start)+6;
const guard=page.slice(start,end);
for(const status of ['closed','loading','open']){
  const messages=[];
  const check=vm.runInNewContext(`(()=>{${guard};return requireOpenTicketShift;})()`,{shiftStatus:status,showToast:(...args)=>messages.push(args)});
  assert.equal(check(),status==='open');
  assert.equal(messages.length,status==='open'?0:1);
}
console.log('PASS: closed ticket inert, menu/open-shift accessible, populated save/charge disabled, reopen restores controls, transaction guard rejects closed/loading shifts');
