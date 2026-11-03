const fs=require('fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('components/finance/FinanceInventoryManager.jsx','utf8');
const fn=source.slice(source.indexOf('  function calculateSourceTotals('),source.indexOf('  async function loadBase()'));
const items=[{id:'cup',unit:'pc'}];
const calculate=store=>new Function('items','toBulk','selectedStoreId',`${fn};return calculateSourceTotals`)(items,(_item,value,unit)=>Number(value)*(unit==='pack'?100:1),store);
const outgoing={inventory_item_id:'cup',from_store_id:'pasong',to_store_id:'diliman',quantity:100,unit:'pc'};
let totals=calculate('diliman')({transfers:[outgoing]});assert.equal(totals.purchases.cup,100);assert.equal(totals.transfers.cup||0,0);assert.equal(totals.receivedRows,1);assert.equal(totals.purchases.cup-7,93);
totals=calculate('pasong')({transfers:[outgoing]});assert.equal(totals.purchases.cup||0,0);assert.equal(totals.transfers.cup,100);assert.equal(totals.receivedRows,0);
const incoming={...outgoing,from_store_id:'diliman',to_store_id:'pasong',quantity:20};
for(const store of ['pasong','diliman']){
 totals=calculate(store)({transfers:[outgoing,incoming],expenseRows:[{id:'purchase',inventory_item_id:'cup',quantity:50,unit:'pc'}]});
 const oldNet=50+[outgoing,incoming].reduce((n,t)=>n+(t.to_store_id===store?1:-1)*t.quantity,0);
 assert.equal((totals.purchases.cup||0)-(totals.transfers.cup||0),oldNet);
 assert.equal(totals.purchases.cup,store==='pasong'?70:150);assert.equal(totals.transfers.cup,store==='pasong'?100:20);assert.equal(totals.receivedRows,2);
}
totals=calculate('other')({transfers:[outgoing,incoming]});assert.equal(totals.receivedRows,0);assert.deepEqual(totals.purchases,{});assert.deepEqual(totals.transfers,{});
totals=calculate('diliman')({transfers:[{...outgoing,quantity:2,unit:'pack'}]});assert.equal(totals.purchases.cup,200);
console.log('PASS: both branch directions, incoming Added/outgoing Transfer, mixed receipts, unchanged balances, unrelated stores, bulk conversion.');
