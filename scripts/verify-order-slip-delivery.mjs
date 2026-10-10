import assert from 'node:assert/strict';
import { deliverOrderSlips, withCustomerOrderSlip } from '../lib/orderSlipDelivery.js';
let saved = {};
let failure = true;
const writes = [];
const kitchen = { key: 'kitchen', groupName: 'Kitchen', items: [{ cartItemId: 1, name: 'Chicken', quantity: 1 }] };
const bar = { key: 'bar', groupName: 'Bar', items: [{ cartItemId: 2, name: 'Latte', quantity: 1 }] };
const deliver = jobs => deliverOrderSlips({
  jobs, load: async () => structuredClone(saved), persist: async value => { saved = structuredClone(value); },
  print: async job => { if (failure && job.key === 'kitchen') throw new Error('Disconnected'); writes.push(job); },
});
await assert.rejects(() => deliver([kitchen, bar]), /next save or charge/);
assert.deepEqual(writes.map(job => job.groupName), ['Bar'], 'One group failure does not block the other group');
failure = false;
await deliver([kitchen, bar]);
assert.deepEqual(writes.map(job => job.groupName), ['Bar', 'Kitchen'], 'Charge retries only the failed group');
assert.equal(await deliver([kitchen, bar]), 0, 'Repeated save or charge does not duplicate slips');
await deliver([{ ...bar, items: [{ ...bar.items[0], quantity: 3 }] }]);
assert.equal(writes.at(-1).items[0].quantity, 2, 'Quantity increase prints only the addition');
assert.equal(await deliver([{...bar,items:[{...bar.items[0],quantity:3}]}]), 0);
await deliver([{ key: 'unassigned', groupName: 'Order Slip', items: [{ cartItemId: 3, quantity: 1 }] }]);
assert.equal(writes.at(-1).groupName, 'Order Slip');
console.log('PASS: independent group failures, retry on charge, acknowledged slips skipped, quantity additions, unmatched category slip');

saved = {};
writes.length = 0;
const combinedJobs = withCustomerOrderSlip([kitchen, bar], [...kitchen.items, ...bar.items], 'Dine-in');
await deliver(combinedJobs);
assert.deepEqual(writes.map(job => job.key), ['kitchen', 'bar', 'customer-copy']);
assert.deepEqual(writes.at(-1).items.map(item => item.name), ['Chicken', 'Latte']);
assert.equal(await deliver(combinedJobs), 0, 'Customer copy is independently acknowledged');
await deliver(withCustomerOrderSlip([kitchen, bar], [...kitchen.items, ...bar.items, { cartItemId: 4, name: 'Tea', quantity: 1 }], 'Dine-in'));
assert.deepEqual(writes.at(-1).items.map(item => item.name), ['Tea'], 'Customer copy prints only later additions');
console.log('PASS: combined customer copy, no duplicates, additions only');
for (const dining of ['Dine-in', 'Dine In', 'DINEIN', 'ONLINE: DINE-IN', 'Table 4', 'VIP Room', 'VIP Room - Birthday']) {
  assert.equal(withCustomerOrderSlip([bar], bar.items, dining).length, 2, dining);
}
for (const dining of ['Takeout', 'ONLINE: TAKEOUT', 'GRABFOOD', 'GRAB - 123', 'Foodpanda', 'ShopeeFood', 'Delivery', '', 'POS ORDER']) {
  assert.equal(withCustomerOrderSlip([bar], bar.items, dining).length, 1, dining);
}
console.log('PASS: customer copy limited to dine-in tables and VIP room');
