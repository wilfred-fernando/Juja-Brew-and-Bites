import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { branchMenuAvailability, applyMenuAvailability, updateCatalogAvailability, updateCatalogOptionAvailability, saveMenuAvailability } from '../lib/menuAvailability.mjs';

const old={id:'item',is_available:false,global_is_available:false,updated_at:'2026-11-12T01:00:00Z',variants:[{name:'Size'}]};
const saved={id:'item',is_available:true,updated_at:'2026-11-12T02:00:00Z'};
const snapshot={rawItems:[old],items:[old],catalogFingerprint:'old',otherSetting:42};
const updated=updateCatalogAvailability(snapshot,saved);
assert.equal(updated.rawItems[0].is_available,true);assert.equal(updated.items[0].global_is_available,true);
assert.equal(updated.otherSetting,42);assert.equal(updated.catalogFingerprint,null);assert.equal(snapshot.items[0].is_available,false);
assert.equal(applyMenuAvailability(updated.items[0],old).is_available,true,'Late acknowledgements must not overwrite a newer state');
assert.deepEqual(updated.items[0].variants,old.variants);
const blockedAtBranch = { ...old, store_is_available: false };
assert.equal(applyMenuAvailability(blockedAtBranch, saved).store_is_available, false);
const categories = [{ id: 'drinks', name: 'Drinks' }];
const itemRules = [{ store_id: 'pasong-tamo', item_id: 'item', is_available: false }];
const categoryRules = [{ store_id: 'diliman', category_id: 'drinks', is_available: false }];
const availableInPasongTamo = branchMenuAvailability('pasong-tamo', categories, itemRules, categoryRules);
const availableInDiliman = branchMenuAvailability('diliman', categories, itemRules, categoryRules);
assert.equal(availableInPasongTamo({ id: 'item', category: 'Food' }), false);
assert.equal(availableInDiliman({ id: 'item', category: 'Food' }), true);
assert.equal(availableInPasongTamo({ id: 'other', category: 'Drinks' }), true);
assert.equal(availableInDiliman({ id: 'other', category: 'Drinks' }), false);
const optionSnapshot={rawItems:[old],items:[{id:'item',variants:[{name:'Add on',options:[{name:'Pearl',isAvailable:false}]}]}],optionSelectionStoreAvailability:[]};
const optionSaved={group_key:'add on',option_key:'pearl',is_available:true,updated_at:saved.updated_at};
const optionsUpdated=updateCatalogOptionAvailability(optionSnapshot,optionSaved,value=>String(value).toLowerCase(),value=>String(value).toLowerCase());
assert.equal(optionsUpdated.items[0].variants[0].options[0].isAvailable,true);
assert.equal(optionsUpdated.optionSelectionStoreAvailability[0].is_available,true);
assert.deepEqual(optionsUpdated.rawItems,optionSnapshot.rawItems,'Branch option updates must preserve global template options');
let params;
await saveMenuAvailability({rpc:async(name,args)=>{params={name,args};return {data:saved};}},old,true,'pos');
assert.equal(params.name,'set_shared_menu_availability_checked');assert.equal(params.args.p_expected_updated_at,old.updated_at);
await assert.rejects(()=>saveMenuAvailability({rpc:async()=>({data:{...saved,is_available:false}})},old,true,'pos'),/not confirmed/);

// Exercise the real POS refresh body with delayed RPCs and a newer local toggle.
const page=fs.readFileSync('app/pos/page.jsx','utf8');
const start=page.indexOf('  async function fetchDataUncoalesced('),end=page.indexOf('\n  async function autoPrintBarCupLabels(',start);
assert.ok(start>=0&&end>start);
const source=page.slice(start,end);
async function refreshScenario({reject=false,changeRevision=true}={}) {
 let release;const pending=new Promise((resolve,rejectPromise)=>{release=()=>reject?rejectPromise(Error('offline')):resolve({data:'fingerprint'});});
 const writes=[],cacheWrites=[],revision={current:0};
 const catalogRows = {
   menu_items: [{ ...saved, category: 'Drinks' }, { id: 'other', category: 'Food', is_available: true }],
   menu_categories: categories,
   menu_item_store_availability: [{ store_id: 'branch', item_id: 'other', is_available: false }],
   menu_category_store_availability: [{ store_id: 'branch', category_id: 'drinks', is_available: false }],
 };
 const query=table=>{const q={select:()=>q,order:()=>q,eq:()=>q,gt:()=>q,then:resolve=>resolve({data:catalogRows[table] || []})};return q;};
 const context={console,Date,Map,Array,Promise,String,Number,items:[{...old,is_available:true}],customers:[],
   catalogAvailabilityRevision:revision,supabase:{rpc:()=>pending,from:query},
   getLocalSnapshot:async key=>key==='pos_catalog'?{data:snapshot}:null,readJsonStorage:()=>null,
   POS_OFFLINE_CACHE_KEY:'cache',POS_CATALOG_FULL_RECONCILE_MS:1000,
   setItems:value=>writes.push(value),setCategories:()=>{},setCustomers:()=>{},setLoading:()=>{},setRecipeRows:()=>{},setRecipeInventoryItems:()=>{},setIsOfflineMode:()=>{},
   setLocalSnapshot:async(...args)=>cacheWrites.push(args),serializeCatalogCache:async work=>work(),
   branchMenuAvailability,optionGroupKey:String,optionSelectionKey:String,showToast:()=>{},formatReceiptDateTime:String,
   localStorage:{removeItem:()=>{}},loadPosSettings:async()=>{},loadPrinters:async()=>{},loadBarPrinterCategories:async()=>{},
 };
 const refresh=vm.runInNewContext(`(${source.trim()})`,context);
 const work=refresh('branch',{showLoading:true});
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(writes.length,0,'Opening refresh must not replace existing live rows with cached unavailable rows');
 if(changeRevision)revision.current++;
 release();await work;
 if(changeRevision||reject){assert.equal(writes.length,0);assert.equal(cacheWrites.length,0);}
 else {
   assert.equal(writes.length,1);
   assert.equal(cacheWrites.length,1);
   for (const item of writes[0]) {
     assert.equal(item.is_available, true, 'The Admin and POS shared switch still shows shared status');
     assert.equal(item.store_is_available, false, 'The sales grid must honor branch overrides');
   }
   assert.equal(cacheWrites[0][1].categoryStoreAvailability.length, 1);
 }
}
await refreshScenario();await refreshScenario({reject:true});await refreshScenario({reject:true,changeRevision:false});await refreshScenario({changeRevision:false});
console.log('PASS: raw/rendered cache updates, version acknowledgement, late acknowledgements, in-flight refresh races, offline fallback, and ordinary catalog refresh.');
