import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loyaltySearchFilter, matchesLoyaltySearch } from '../lib/posLoyaltySearch.js';
const customer = { customer_name: 'Maria  Elena Santos', customer_code: 'JUJA123' };
for (const query of ['maria santos', 'SANTOS MARIA', '  Maria   Elena ', 'juja123']) {
  assert.equal(matchesLoyaltySearch(customer, query), true, query);
}
assert.equal(matchesLoyaltySearch(customer, 'Maria Cruz'), false);
assert.equal(loyaltySearchFilter(' Santos   Maria '), 'and(customer_name.ilike.%santos%,customer_name.ilike.%maria%),customer_code.ilike.%santos maria%');
assert.equal(loyaltySearchFilter('%,()_'), null);
const page = readFileSync(new URL('../app/pos/page.jsx', import.meta.url), 'utf8');
const searchEffect = page.slice(page.indexOf('    const query = normalizeLoyaltySearch(customerSearch);'), page.indexOf('  }, [customerSearch, attachedCustomer?.id]);'));
assert.ok(searchEffect.includes('searchCustomersRemote(query, 8)'));
assert.ok(!searchEffect.includes('hasLocalMatch'), 'Cached matches must not suppress database search');
assert.ok(searchEffect.includes('if (!cancelled)'), 'Stale responses cannot replace current matches');
console.log('PASS: partial names, reversed name order, whitespace, codes, filter escaping, cached-match refresh, stale-response guard');
