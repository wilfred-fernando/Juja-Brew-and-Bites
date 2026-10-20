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
assert.equal(vatReference.rows[0].invoiceFrom, '001');
assert.equal(vatReference.rows[0].invoiceTo, '005');
assert.equal(vatReference.totals.invoiceCount, 5);
assert.equal(vatReference.rows[1].invoiceFrom, '');
assert.equal(vatReference.totals.loyalty, 12);
assert.equal(vatReference.totals.grossSales - vatReference.totals.vatRemoved - vatReference.totals.totalDiscounts - vatReference.totals.refunds, vatReference.totals.referenceNet);
assert.equal(report.totals.net, 560.4, 'Recorded report unchanged, including refunds and incomplete receipts');
assert.equal(JSON.stringify(data), snapshot, 'No input mutation');
const mismatched = buildFinanceMonthlySales({ sales: [sale('x', 224, 44.8)], lineItems: [item('x', 112, 22.4, { discountName: 'SC' })] }, '2026-08');
assert.equal(mismatched.vatReference.totals.reviewCount, 1);
assert.equal(mismatched.vatReference.totals.referenceNet, 0);
const labels = ['Free', 'Special Discount', 'Special Discount %', 'Whole Item Discount', 'QCID Promo', 'Teacher Promo', 'Birthday Voucher'];
const grouped = buildFinanceMonthlySales({
  sales: labels.map((name, index) => sale(`group-${index}`, 112, 12, { date: index === 6 ? '2026-08-12' : date })),
  lineItems: labels.map((discountName, index) => item(`group-${index}`, 112, 12, { discountName })),
}, '2026-08').vatReference;
assert.equal(grouped.totals.employeeMeal, 12);
assert.equal(grouped.totals.employeeDiscount, 36);
assert.equal(grouped.totals.promos, 24);
assert.equal(grouped.totals.loyalty, 12);
assert.equal(grouped.totals.totalDiscounts, 84);
assert.equal(grouped.rows[1].invoiceFrom, '007');
assert.equal(grouped.rows[1].invoiceTo, '007');
assert.equal(grouped.totals.invoiceTo, '007');
assert.equal(grouped.totals.grossSales - grouped.totals.totalDiscounts, grouped.totals.referenceNet);
const continued = {
  sales: [sale('before', 112, 0, {date: '2026-08-10'}), sale('aug', 112, 0),
    sale('aug-review', 112, 0), sale('sep', 112, 0, {date: '2026-09-30'}),
    sale('other-store', 112, 0, {date: '2026-09-30', storeId: 'b'}),
    sale('unpaid', 112, 0, {date: '2026-09-30', status: 'Pending'}),
    sale('oct', 112, 0, {date: '2026-10-01'}), sale('nov', 112, 0, {date: '2026-11-01'})],
  lineItems: [],
};
const september = buildFinanceMonthlySales(continued, '2026-09', 'a');
assert.equal(september.vatReference.totals.invoiceFrom, '003');
assert.equal(september.vatReference.totals.invoiceTo, '003');
const october = buildFinanceMonthlySales(continued, '2026-10', 'a');
assert.equal(october.vatReference.rows[0].invoiceFrom, '004');
assert.equal(october.vatReference.totals.invoiceCount, 1);
assert.equal(october.report.totals.gross, 112, 'Prior months only offset the SI, never current month sales');
assert.equal(buildFinanceMonthlySales(continued, '2026-10').vatReference.totals.invoiceFrom, '005');
assert.equal(buildFinanceMonthlySales(continued, '2026-11', 'a').vatReference.totals.invoiceFrom, '005');
console.log('PASS: VAT-inclusive mixed receipt, SC/PWD, voucher exclusion, cent rounding, refunds and missing details flagged, cutoff/store filters, reconciliation, immutable recorded sales.');
