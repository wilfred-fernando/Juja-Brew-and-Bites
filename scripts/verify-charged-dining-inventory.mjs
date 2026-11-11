import assert from 'node:assert/strict';
import { posInventoryConsumption, convertQuantity } from '../lib/inventory.js';

const original = {transaction_type:'pos_deduction',quantity:2,quantity_effect:-2};
const returned = {transaction_type:'correction',quantity:2,quantity_effect:2};
const deductedAgain = {transaction_type:'correction',quantity:2,quantity_effect:-2};
assert.equal(posInventoryConsumption(original),2);
assert.equal([original,returned].reduce((n,t)=>n+posInventoryConsumption(t),0),0);
assert.equal([original,returned,deductedAgain].reduce((n,t)=>n+posInventoryConsumption(t),0),2);
assert.equal(posInventoryConsumption({quantity:2,quantity_effect:0}),0);
assert.equal(posInventoryConsumption({quantity:2}),2);
assert.equal(convertQuantity(posInventoryConsumption(returned),'pc','pc'),-2);
console.log('PASS: existing inventory report format nets cup returns and new deductions, retains signed unit conversions, and preserves legacy rows.');
