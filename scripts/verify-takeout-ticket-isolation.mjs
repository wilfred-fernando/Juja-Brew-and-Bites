import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const page=fs.readFileSync('app/pos/page.jsx','utf8');
const between=(start,end)=>page.slice(page.indexOf(start),page.indexOf(end,page.indexOf(start))).trim();
const loadSource=between('  async function loadDiningOptionOrder(', '\n  async function handleDiningChange(');
const saveSource=between('  async function saveTableOrder(', '\n  async function fetchSavedTickets(');
assert(loadSource&&saveSource);
const old={id:'existing-takeout',store_id:'branch',order_type:'TAKEOUT',ticket_name:'TAKEOUT',items:[{id:'old-food',name:'Pending food',quantity:1}],created_at:'2026-11-16T00:00:00Z'};
const records=new Map([[old.id,structuredClone(old)]]);
let reads=0,inserts=0,updates=0,kdsCreates=0,deferRead=false,releaseRead;
const query=()=>{
 let operation='read',payload,filters=[];
 const matches=()=>[...records.values()].filter(row=>filters.every(([key,value])=>row[key]===value));
 const result=()=>{
   if(operation==='insert'){
     const row={...structuredClone(payload[0]),id:'new-'+(++inserts),created_at:'2026-11-16T01:00:00Z'};records.set(row.id,row);return row;
   }
   if(operation==='update'){
     const row=matches()[0];if(!row)return null;updates++;Object.assign(row,structuredClone(payload));return structuredClone(row);
   }
   reads++;return structuredClone(matches()[0]||null);
 };
 const q={select:()=>q,eq:(key,value)=>{filters.push([key,value]);return q;},order:()=>q,limit:()=>q,
   insert:value=>{operation='insert';payload=value;return q;},update:value=>{operation='update';payload=value;return q;},
   single:async()=>({data:result()}),maybeSingle:async()=>({data:result()}),then:resolve=>{
     const deliver=()=>{const row=result();return resolve({data:row?[row]:[]});};
     if(deferRead){releaseRead=deliver;return;}return deliver();
   }};
 return q;
};
const context={console,Date,String,Number,Map,Array,cart:[],originalTicketId:null,storeId:'branch',
 diningSelectionVersionRef:{current:0},
 supabase:{from:()=>query()},activeWebOrderId:null,isVipBooking:false,selectedBooking:null,diningOption:'takeout',ticketDiningLabel:'TAKEOUT',subtotal:100,attachedCustomer:null,customers:[],
 setOriginalTicketId:value=>{context.originalTicketId=value;},setCart:value=>{context.cart=value;},setAttachedCustomer:()=>{},
 clearActiveWebOrderContext:()=>{},showToast:()=>{},isTableDiningOption:name=>/^TABLE /i.test(name),isDiningOptionOccupied:()=>false,
 jsonSafeValue:value=>value,enrichOrderItemsForKds:value=>value,assertTicketInCurrentStore:()=>{},getTicketStoreId:row=>row.store_id,
 fetchOpenTicketLineItems:async ids=>new Map(ids.map(id=>[id,structuredClone(records.get(id)?.items||[])])),
 syncOpenTicketLineItems:async()=>{},getAddedTicketLines:()=>[],getKitchenPrinterGroupItems:value=>value,
 upsertKdsTicket:async()=>{kdsCreates++;return {};},appendKdsTicketItems:async()=>{throw Error('Unexpected KDS resend');},
 autoPrintOrderSlip:async()=>{},autoPrintBarCupLabels:async()=>{},
};
const load=vm.runInNewContext(`(${loadSource})`,context),save=vm.runInNewContext(`(${saveSource})`,context);
for(const label of ['TAKEOUT','Takeout',' take-out ','ONLINE: TAKEOUT','DINE-IN','VIP ROOM','VIP Booking','GRAB','GRABFOOD','SHOPEEFOOD','FOODPANDA','DELIVERY']){
 assert.equal(await load(label),true);assert.equal(context.originalTicketId,null);assert.deepEqual(context.cart,[]);
}
assert.equal(reads,0,'Shared dining options must not fetch the latest saved ticket');
context.cart=[{id:'new-food',name:'New food',quantity:1}];await load('TAKEOUT');await save();
assert.equal(inserts,1);assert.equal(updates,0);assert.deepEqual(records.get(old.id),old);
// Saving clears the workspace in the POS; the next Takeout selection stays new.
context.cart=[];context.originalTicketId=null;await load('TAKEOUT');
context.cart=[{id:'second-food',name:'Another customer',quantity:1}];await save();
assert.equal(inserts,2);assert.equal(kdsCreates,2);assert.equal(records.size,3);assert.deepEqual(records.get(old.id),old);
// Explicitly resumed tickets retain their identity and can still be edited.
context.originalTicketId=old.id;context.cart=structuredClone(old.items);await load('TAKEOUT');
assert.equal(context.originalTicketId,old.id);await save();assert.equal(updates,1);assert.equal(kdsCreates,2);
// A missing resumed ID cannot silently redirect the save to a different Takeout.
const before=structuredClone([...records.entries()]);context.originalTicketId='deleted-ticket';
await assert.rejects(()=>save(),/Saved ticket was not updated/);assert.deepEqual([...records.entries()],before);assert.equal(updates,1);
records.set('table',{...structuredClone(old),id:'table',order_type:'TABLE 1',ticket_name:'TABLE 1'});
context.originalTicketId=null;context.cart=[];
assert.equal(await load('TABLE 1'),false,'An occupied table must still require explicit resume');
assert.deepEqual(context.cart,[]);
// A delayed response from the previous dining selection cannot replace Takeout.
records.set('stale-dining',{...structuredClone(old),id:'stale-dining',order_type:'TABLE 2'});
deferRead=true;context.diningSelectionVersionRef.current=1;
const delayed=load('TABLE 2',1);
await new Promise(resolve=>setTimeout(resolve,0));
context.diningSelectionVersionRef.current=2;
await load('TAKEOUT',2);deferRead=false;releaseRead();
assert.equal(await delayed,false);assert.equal(context.originalTicketId,null);assert.deepEqual(context.cart,[]);
// Both dining pickers must receive occupied IDs, including the currently
// resumed table: it cannot be reused for a new/split ticket while occupied.
const keyHelpers=between('function tableDiningKey(', '// ================= MAIN TERMINAL SCREEN');
const occupancy=between('  const occupiedTableKeys = useMemo(', '\n  function isDiningOptionOccupied(');
const disabled=vm.runInNewContext(`(()=>{${keyHelpers}\n${occupancy}\nreturn occupiedDiningOptionIds;})()`,{
  useMemo:work=>work(),originalTicketId:'own-table',
  savedTickets:[{id:'own-table',order_type:'TABLE 1'},{id:'takeout',order_type:'TAKEOUT'}],
  activeKitchenTables:[{source_id:'own-table:batch:pending',key:'TABLE 2'}],
  diningOptions:[{id:'table1',name:'TABLE 1'},{id:'table2',name:'TABLE 2'},{id:'table3',name:'TABLE 3'},
    {id:'takeout',name:'TAKEOUT'},{id:'dinein',name:'DINE-IN'},{id:'vip',name:'VIP ROOM'}],
});
assert.deepEqual([...disabled].sort(),['table1','table2']);
console.log('PASS: independent Takeout orders, preserved existing tickets/carts, separate KDS creates, explicit resume, missing-ID protection and occupied-table guard.');
