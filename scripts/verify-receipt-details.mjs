import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { enrichReceiptItemRows, receiptItemDetails, receiptLineMetadata } from "../lib/reports/receiptDetails.js";

const fries = { id: "fries", cartItemId: 1, quantity: 1, unitPrice: 69, variantDetails: "Large, Cheese", selectedOptions: [{ name: "Large", groupName: "Fries Size" }, { name: "Cheese", groupName: "Flavor" }] };
const nachos = { id: "nachos", cartItemId: 2, quantity: 1, unitPrice: 179, discountAmount: 35.800000000000004, discountName: "SC | PWD", discountBeneficiary: { full_name: "Test Beneficiary", beneficiary_type: "pwd", id_number: "00123" } };
const rows = [
  { id: "n", menu_item_id: "nachos", quantity: 1, unit_price: 179, discount_amount: 35.8, net_amount: 143.2, refund_amount: 0, modifiers: [] },
  { id: "f", menu_item_id: "fries", quantity: 1, unit_price: 69, discount_amount: 0, net_amount: 69, modifiers: [] },
];
const enriched = enrichReceiptItemRows(rows, JSON.stringify([fries, nachos]));
assert.equal(enriched[0].discountBeneficiaryName, "Test Beneficiary");
assert.equal(enriched[0].discountBeneficiaryIdNumber, "00123");
assert.equal(enriched[1].selectedOptions.length, 2);
assert.equal(enriched[1].discountBeneficiaryName, "");
for (let i = 0; i < rows.length; i++) {
  for (const key of Object.keys(rows[i])) assert.deepEqual(enriched[i][key], rows[i][key], `${key} must remain authoritative`);
}
assert.equal(rows[0].discountBeneficiaryName, undefined, "Do not mutate source data");

const senior = { ...nachos, cartItemId: 3, discountBeneficiary: { full_name: "Senior Beneficiary", beneficiary_type: "senior_citizen", id_number: "00456" } };
const groupRows = [rows[0], { ...rows[0], id: "second" }, { ...rows[0], id: "unmatched" }];
const group = enrichReceiptItemRows(groupRows, [nachos, senior]);
assert.deepEqual(group.map((row) => row.discountBeneficiaryName), ["Test Beneficiary", "Senior Beneficiary", ""]);
const linked = enrichReceiptItemRows([{ ...rows[0], source_metadata: { pos_cart_item_id: "3" } }], [nachos, senior]);
assert.equal(linked[0].discountBeneficiaryType, "senior_citizen", "Stable ticket ID must win over product match");
const persisted = enrichReceiptItemRows([{ ...rows[0], source_metadata: receiptLineMetadata(senior) }]);
assert.equal(persisted[0].discountBeneficiaryIdNumber, "00456", "Future archived rows retain their own details");
assert.equal(enrichReceiptItemRows([{ ...rows[0], discount_amount: 0 }], [nachos])[0].discountBeneficiaryName, "", "Do not attribute a beneficiary to a different line");
assert.deepEqual(receiptItemDetails({ selectedOptions: [], modifiers: fries.selectedOptions }).selectedOptions, fries.selectedOptions);
assert.equal(enrichReceiptItemRows(rows, "invalid JSON")[0].discountBeneficiaryName, "");

const page = readFileSync(new URL("../app/admin/sales/page.jsx", import.meta.url), "utf8");
const optionSource = page.slice(page.indexOf("function normalizeReceiptText("), page.indexOf("function normalizeVoucher("));
const { receiptOptionLines } = vm.runInNewContext(`${optionSource}; ({ receiptOptionLines });`);
assert.equal(JSON.stringify(receiptOptionLines(enriched[1])), JSON.stringify(["Fries Size: Large", "Flavor: Cheese"]));
assert.equal(JSON.stringify(receiptOptionLines({ variantDetails: "Hot, Large" })), JSON.stringify(["Hot, Large"]));

const dates = readFileSync(new URL("../lib/businessDay.js", import.meta.url), "utf8").replace(/^export /gm, "");
const { shiftBusinessDate } = vm.runInNewContext(`${dates}; ({ shiftBusinessDate });`, { Intl, Date });
const source = readFileSync(new URL("../lib/reports/salesReports.js", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
const { normalizeSalesData } = vm.runInNewContext(`${source}; ({ normalizeSalesData });`, { Intl, Date, shiftBusinessDate, enrichReceiptItemRows, receiptItemDetails });
const normalized = normalizeSalesData({ orders: [{ id: "order", status: "paid", total: 212.2, items: [fries, nachos] }], orderItems: rows.map((row) => ({ ...row, order_id: "order" })) });
assert.equal(normalized.lineItems[0].discountBeneficiaryType, "pwd");
assert.equal(normalized.lineItems[0].discount, 35.8);
assert.equal(normalized.lineItems[0].net, 143.2);
assert.equal(normalized.lineItems[1].selectedOptions.length, 2);
console.log("Receipt details verified: all option groups, SC/PWD identity, legacy snapshots, stable line IDs, group orders, persisted metadata and unchanged amounts.");
