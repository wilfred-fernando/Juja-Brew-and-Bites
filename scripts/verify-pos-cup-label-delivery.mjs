import assert from 'node:assert/strict';
import { cupLabelJobs, shouldAutoPrintCupLabels } from '../lib/posCupLabelDelivery.js';
import { deliverOrderSlips } from '../lib/orderSlipDelivery.js';
for (const dining of ['GRAB - 123', 'GrabFood', 'SHOPEE - 321', 'ShopeeFood', 'Takeout', 'Take-out', 'ONLINE: TAKEOUT', 'Foodpanda']) {
  assert.equal(shouldAutoPrintCupLabels(dining), true, dining);
}
for (const dining of ['Table 4', 'Dine-in', 'VIP Room', '']) assert.equal(shouldAutoPrintCupLabels(dining), false, dining);
let saved = {};
let fail = true;
const printed = [];
const drinks = [{ cartItemId: 'latte', name: 'Latte', quantity: 2 }];
const build = rows => rows.flatMap(row => Array.from({ length: row.quantity }, () => row.name));
const deliver = cart => deliverOrderSlips({
  jobs: cupLabelJobs(cart, build), load: async () => saved,
  persist: async state => { saved = { ...state }; },
  print: async job => {
    if (fail && job.key.endsWith(':2')) throw new Error('Printer disconnected');
    printed.push(job.key);
  },
});
await assert.rejects(() => deliver(drinks));
assert.equal(printed.length, 1);
fail = false;
await deliver(drinks);
assert.equal(printed.length, 2, 'Retry prints only the failed cup');
assert.equal(await deliver(drinks), 0, 'Charge does not repeat saved labels');
await deliver([{ ...drinks[0], quantity: 3 }]);
assert.equal(printed.length, 3, 'Quantity increase prints one new label');
console.log('PASS: dining aliases, automatic takeout, per-cup retries, save/charge dedupe, quantity additions');
