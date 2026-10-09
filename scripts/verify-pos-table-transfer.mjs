import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const page = readFileSync(new URL('../app/pos/page.jsx', import.meta.url), 'utf8');
const start = page.indexOf('  async function loadDiningOptionOrder(');
const end = page.indexOf('  async function saveTableOrder(', start);
assert.ok(start >= 0 && end > start);
const food = [
  { cartItemId: 1, name: 'Korean BBQ Chicken', quantity: 1, category: 'RICE MEALS' },
  { cartItemId: 2, name: 'Chicken ala King', quantity: 1, category: 'RICE MEALS' },
];
const drinks = [{ cartItemId: 3, name: 'Lemonade', quantity: 1, category: 'JUICE' }];
let targetTicket = null;
const context = {
  originalTicketId: 'original-table-4', cart: [...food, ...drinks], storeId: 'store',
  diningOptions: [{ id: 'table9', name: 'TABLE 9' }],
  diningOption: 'table4',
  savedTableSelectionLocked: true,
  isTableDiningOption: name => name.startsWith('TABLE'), isDiningOptionOccupied: () => false,
  isVipRoomDiningOptionName: () => false, showToast: () => {}, setGrabOrderNumber: () => {},
  setOriginalTicketId: id => { context.originalTicketId = id; },
  setCart: items => { context.cart = items; },
  setDiningOption: id => { context.diningOption = id; },
  clearActiveWebOrderContext: () => {},
  supabase: { from: () => {
    const query = {};
    for (const method of ['select', 'eq', 'order']) query[method] = () => query;
    query.limit = async () => ({ data: targetTicket ? [targetTicket] : [], error: null });
    return query;
  } },
};
const handlers = vm.runInNewContext(`${page.slice(start, end)}; ({ handleDiningChange, loadDiningOptionOrder });`, context);
await handlers.handleDiningChange('table9');
assert.equal(context.diningOption, 'table4', 'Resumed saved table cannot change');
assert.equal(context.originalTicketId, 'original-table-4');
assert.equal(context.cart.length, 3);
await handlers.handleDiningChange('invalid');
assert.equal(context.diningOption, 'table4');
context.savedTableSelectionLocked = false;
await handlers.handleDiningChange('table9');
assert.equal(context.originalTicketId, 'original-table-4', 'Moving table retains saved ticket identity');
assert.equal(context.diningOption, 'table9');
assert.equal(context.cart.length, 3, 'Food and newly added drink stay in cart');
const deltaStart = page.indexOf('  const stableTicketLineKey =');
const deltaEnd = page.indexOf('  const getKitchenPrinterGroupItems =', deltaStart);
const delta = vm.runInNewContext(`${page.slice(deltaStart, deltaEnd)}; getAddedTicketLines;`, { normalizeLabelLine: value => String(value || '').trim() });
const additions = delta(food, context.cart);
assert.deepEqual(Array.from(additions, item => item.name), ['Lemonade']);
assert.equal(additions.filter(item => item.category === 'RICE MEALS').length, 0, 'Drinks-only save sends no previous food to kitchen');
assert.equal(delta(context.cart, context.cart).length, 0, 'Repeated save sends nothing');
await handlers.handleDiningChange('invalid');
assert.equal(context.originalTicketId, 'original-table-4');
assert.equal(context.diningOption, 'table9', 'Invalid selection cannot detach saved ticket');
targetTicket = { id: 'other-table-9' };
context.diningOption = 'table4';
await handlers.handleDiningChange('table9');
assert.equal(context.diningOption, 'table4', 'Occupied target cannot replace current ticket');
assert.equal(context.originalTicketId, 'original-table-4');
targetTicket = { id: 'takeout-other' };
assert.equal(await handlers.loadDiningOptionOrder('TAKEOUT'), true);
assert.equal(context.originalTicketId, 'original-table-4', 'Changing to takeout also retains current saved identity');
console.log('PASS: table transfer, drinks-only delta, repeated save, invalid selection, occupied table, takeout transfer');
