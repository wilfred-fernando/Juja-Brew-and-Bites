import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Run the actual report functions with their local date dependency, without
// requiring Next's alias resolver or mounting the authenticated Admin page.
const businessDay = readFileSync(new URL("../lib/businessDay.js", import.meta.url), "utf8").replace(/^export /gm, "");
const { shiftBusinessDate } = vm.runInNewContext(`${businessDay}; ({ shiftBusinessDate });`, { Intl, Date });
const reports = readFileSync(new URL("../lib/reports/salesReports.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
const { normalizeSalesData, getSalesSummary, getProductSalesReport, deduplicateReportRows } = vm.runInNewContext(
  `${reports}; ({ normalizeSalesData, getSalesSummary, getProductSalesReport, deduplicateReportRows });`, { Intl, Date, shiftBusinessDate },
);
const order = {
  id: "dbfb7b5f-b722-4392-8ba7-eeaf7878c3a9", receipt_number: "D1936177", status: "paid",
  total: 129, subtotal: 129, net_amount: 129, gross_amount: 129, payment_method: "Cash",
  created_at: "2026-09-03T14:48:02.974Z", paid_at: "2026-09-03T14:47:30.742Z", store_id: "diliman",
};
const item = {
  id: "bf83d953-cde9-4d3b-88a4-3b6722869ab5", order_id: order.id, menu_item_id: "latte",
  name: "Salted Caramel Latte", quantity: 1, unit_price: 129, line_total: 129, net_amount: 129, gross_amount: 129,
};

const overlapped = normalizeSalesData({ orders: [{ ...order }, { ...order }], orderItems: [{ ...item }, { ...item }] });
assert.equal(overlapped.sales.length, 1);
assert.equal(overlapped.lineItems.length, 1, "D1936177 must display one latte rather than four");
assert.equal(overlapped.lineItems[0].net, 129);
assert.equal(getSalesSummary(overlapped.sales).net, 129);
assert.equal(getSalesSummary(overlapped.sales).orders, 1);
assert.equal(getProductSalesReport(overlapped.lineItems, 129)[0].quantity, 1);

const refundedOrder = { ...order, status: "refunded", refund_amount: 129 };
const refundedItem = { ...item, status: "refunded", refund_amount: 129 };
const updated = normalizeSalesData({ orders: [order, refundedOrder], orderItems: [item, refundedItem] });
assert.equal(updated.sales.length, 1);
assert.equal(updated.sales[0].raw, refundedOrder, "The live version wins over the archived version");
assert.equal(updated.sales[0].net, 0);
assert.equal(updated.lineItems[0].net, 0);

const separateLines = normalizeSalesData({
  orders: [order],
  orderItems: [item, { ...item, id: "another-ticket-line", discount_amount: 25.8, net_amount: 103.2 }],
});
assert.equal(separateLines.lineItems.length, 2, "Separate IDs for the same product must survive");
assert.equal(separateLines.lineItems[1].net, 103.2);
assert.equal(deduplicateReportRows([{ name: "Latte" }, { name: "Latte" }]).length, 2, "ID-less lines must not be collapsed by name");

const archivedOnly = { ...order, id: "archived-order", receipt_number: "D0000001" };
const archivedItem = { ...item, id: "archived-item", order_id: archivedOnly.id };
const mixed = normalizeSalesData({ orders: [archivedOnly, order, { ...order }], orderItems: [archivedItem, item, { ...item }] });
assert.equal(mixed.sales.length, 2);
assert.equal(mixed.lineItems.length, 2);
assert.equal(getSalesSummary(mixed.sales).net, 258);

const web = { ...order, id: "web-order", receipt_number: "W0000001", status: "completed", items: [{ name: "Latte", price: 129, quantity: 1 }] };
const webOnly = normalizeSalesData({ webOrders: [web, { ...web }] });
assert.equal(webOnly.sales.length, 1);
assert.equal(webOnly.lineItems.length, 1);
const converted = normalizeSalesData({ orders: [{ ...order, source_web_order_id: web.id }], orderItems: [item], webOrders: [web, { ...web }] });
assert.equal(converted.sales.length, 1, "Converted web orders remain represented by their POS sale");
assert.equal(converted.lineItems.length, 1);

const shifts = normalizeSalesData({ shiftRecords: [{ id: "shift", amount: 1 }, { id: "shift", amount: 2 }] }).shiftRecords;
assert.equal(shifts.length, 1);
assert.equal(shifts[0].amount, 2);
assert.equal(order.status, "paid", "Normalization must not mutate the original input rows");
console.log("Verified D1936177: one receipt, one latte, PHP 129; live updates, separate ticket lines, archive-only orders, web conversion and shifts preserved.");
