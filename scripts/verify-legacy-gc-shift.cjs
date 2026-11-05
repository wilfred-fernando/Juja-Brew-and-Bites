const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const page = fs.readFileSync('app/pos/page.jsx', 'utf8');
const start = page.indexOf('  const shiftSummary = useMemo(() => {');
const end = page.indexOf('  }, [receiptRows,', start);
assert(start >= 0 && end > start);
const body = page.slice(start + '  const shiftSummary = useMemo(() => {'.length, end);
const helpers = page.slice(page.indexOf('function normalizePaymentMethodName('), page.indexOf('function coerceReceiptTimestamp('));
const calculate = (splits, amount) => vm.runInNewContext(`${helpers}\n(function(){${body}})()`, {
  receiptRows: [{ receipt_number: 'TEST', status: 'paid', gross_sales: amount, total_collected: amount, payment_splits: splits }],
  receiptItemRows: [], startingCash: 5000, activeShiftStartMs: 0, gcCashCollected: 0,
  reservationCollections: [], reservationSummary: { total: 0, cash: 0, payments: { QRPH: 0 } },
  reservationExtra: { cash: 0, payments: { Cash: 0, QRPH: 0, Card: 0 } },
  formatDate: () => '2026-11-05', receiptDisplayTimestamp: () => null, buildShiftDiscountBreakdown: () => [],
});
const full = calculate([{ method: 'Legacy Physical GC', amount: 200 }], 200);
assert.equal(full.cashPayments, 0);
assert.equal(full.expectedCash, 5000);
assert.equal(full.payments['Legacy Physical GC'], 200);
const mixed = calculate([{ method: 'Legacy Physical GC', amount: 100 }, { method: 'Cash', amount: 150 }], 250);
assert.equal(mixed.cashPayments, 150);
assert.equal(mixed.expectedCash, 5150);
assert.equal(mixed.netSales, 250);
assert.equal(mixed.payments['Legacy Physical GC'], 100);
console.log('PASS: actual POS shift calculation separates legacy GC value from cash and retains the full sale total.');
