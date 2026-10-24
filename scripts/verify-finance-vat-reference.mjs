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

const channels = buildFinanceMonthlySales({sales: [
 sale('grab', 159, 0, {paymentMethod:'GrabFood'}),
 sale('shopee', 3436, 0, {paymentMethod:'ShopeeFood'}),
 sale('split', 100, 0, {date:'2026-08-12',paymentSplits:[{method:'Cash',amount:40},{method:'Grab Food',amount:60}]}),
 sale('old-grab', 999, 0, {date:'2026-08-10',paymentMethod:'GrabFood'}),
 sale('other-grab', 999, 0, {storeId:'b',paymentMethod:'GrabFood'}),
 sale('missing-grab', 999, 0, {paymentMethod:'GrabFood'}),
 sale('refund-grab', 159, 0, {paymentMethod:'GrabFood',refund:10,net:149}),
],lineItems:[item('grab',159,0),item('shopee',3436,0),item('split',100,0),item('old-grab',999,0),item('other-grab',999,0),item('refund-grab',159,0)]},'2026-08','a').vatReference;
assert.equal(channels.rows[0].grabGross,159);
assert.equal(channels.rows[0].grabCommission,-35.49);
assert.equal(channels.rows[0].grabCommissionTax,-4.26);
assert.equal(channels.rows[0].grabEwt,-.71);
assert.equal(channels.rows[0].grabNet,118.54);
assert.equal(channels.rows[0].shopeeGross,3436);
assert.equal(channels.rows[0].shopeeCommission,-828.32);
assert.equal(channels.rows[0].shopeeCommissionTax,-99.4);
assert.equal(channels.rows[0].shopeeEwt,-10.7);
assert.equal(channels.rows[0].shopeeNet,2497.58);
assert.equal(channels.rows[1].grabGross,60);
assert.equal(channels.totals.grabGross,219);
assert.equal(channels.totals.grabNet,163.27);
console.log('PASS: GrabFood and ShopeeFood examples, daily/monthly channel totals, split payments, excluded old/store/refunded/incomplete receipts.');
