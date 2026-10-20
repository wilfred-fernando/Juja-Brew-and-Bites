import assert from 'node:assert/strict';
import { buildFinanceMonthlySales } from '../lib/reports/financeMonthlySales.js';
const date = '2026-08-11';
const sale = (id, gross, discount, extra = {}) => ({ id, date, source: 'POS', storeId: 'a', status: 'Paid', gross, discount, refund: 0, net: gross - discount, ...extra });
const item = (orderId, gross, discount, extra = {}) => ({ orderId, source: 'POS', gross, discount, ...extra });
const data = {
  sales: [sale('mixed', 224, 22.4), sale('pwd', 112, 22.4), sale('voucher', 112, 12), sale('missing', 112, 22.4), sale('refund', 112, 22.4, { refund: 10, net: 79.6 }), sale('old', 999, 0, { date: '2026-08-10' }), sale('other', 500, 0, { storeId: 'b' })],
  lineItems: [item('mixed', 112, 22.4, { discountName: 'SC / PWD' }), item('mixed', 112, 0), item('pwd', 112, 22.4, { discountBeneficiaryType: 'PWD' }), item('voucher', 112, 12, { discountName: 'Senior gift', appliedVoucher: { code: 'gift' } }), item('refund', 112, 22.4, { discountName: 'SC' })],
};
const snapshot = JSON.stringify(data);
const { report, vatReference } = buildFinanceMonthlySales(data, '2026-08', 'a');
assert.equal(vatReference.rows.length, 21);
assert.equal(vatReference.totals.exemptSales, 200);
assert.equal(vatReference.totals.vatRemoved, 24);
assert.equal(vatReference.totals.seniorPwdDiscount, 40);
assert.equal(vatReference.totals.referenceNet, 372);
assert.equal(vatReference.totals.recordedNet, 391.2);
assert.equal(vatReference.totals.difference, 19.2);
assert.equal(vatReference.totals.reviewCount, 2);
assert.equal(vatReference.totals.vatableSales, 189.29);
assert.equal(vatReference.totals.outputVat, 22.71);
assert.equal(report.totals.net, 560.4, 'Recorded report unchanged, including refunds and incomplete receipts');
assert.equal(JSON.stringify(data), snapshot, 'No input mutation');
const mismatched = buildFinanceMonthlySales({ sales: [sale('x', 224, 44.8)], lineItems: [item('x', 112, 22.4, { discountName: 'SC' })] }, '2026-08');
assert.equal(mismatched.vatReference.totals.reviewCount, 1);
assert.equal(mismatched.vatReference.totals.referenceNet, 0);
console.log('PASS: VAT-inclusive mixed receipt, SC/PWD, voucher exclusion, cent rounding, refunds and missing details flagged, cutoff/store filters, reconciliation, immutable recorded sales.');
