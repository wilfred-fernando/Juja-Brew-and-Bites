import assert from "node:assert/strict";
import { buildShiftDiscountBreakdown, discountBreakdownTotal } from "../lib/posDiscountBreakdown.js";

const receipts = [
  { id: "order-1", receipt_number: "R-1", discounts: 300, source_metadata: { order_discount: { name: "Staff Courtesy", amount: 50 } } },
  { id: "order-2", receipt_number: "R-2", discounts: 40 },
];
const items = [
  { order_id: "order-1", receipt_number: "R-1", discount_amount: 20, source_metadata: { pos_line_details: { discountName: "SENIOR CITIZEN | PWD" } } },
  { order_id: "order-1", receipt_number: "R-1", discount_amount: 100, source_metadata: { pos_line_details: { appliedVoucher: { reward_type: "points", code: "PTS100-1" } } } },
  { order_id: "order-1", receipt_number: "R-1", discount_amount: 80, source_metadata: { pos_line_details: { appliedVoucher: { reward_type: "birthday", code: "BDAY2026" } } } },
  { order_id: "order-1", receipt_number: "R-1", discount_amount: 50, source_metadata: { pos_line_details: { discountName: "FREE" } } },
];

const breakdown = buildShiftDiscountBreakdown(receipts, items);
assert.equal(discountBreakdownTotal(breakdown), 340);
assert.deepEqual(Object.fromEntries(breakdown.map((row) => [row.label, row.amount])), {
  "Points Voucher": 100,
  "Birthday Voucher": 80,
  Free: 50,
  "Staff Courtesy": 50,
  "Other / Unspecified": 40,
  "SC / PWD": 20,
});

const archivedFallback = buildShiftDiscountBreakdown([
  { receipt_number: "R-3", discount: 15, items: [{ discountAmount: 15, discountName: "QCID Promo" }] },
]);
assert.deepEqual(archivedFallback, [{ label: "QCID Promo", amount: 15 }]);

const normalizedAdminRows = buildShiftDiscountBreakdown(
  [{ id: "order-4", orderNumber: "R-4", discount: 25, raw: { source_metadata: { order_discount: { name: "FREE Manager Meal" } } } }],
  []
);
assert.deepEqual(normalizedAdminRows, [{ label: "Free", amount: 25 }]);

console.log("Verified named POS/Admin shift discount totals, vouchers, beneficiary discounts, free items, legacy fallback, and archived snapshots.");
