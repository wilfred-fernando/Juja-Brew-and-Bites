import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { addPosCartLine } from "../lib/posCart.js";
import { isRegularDrinkSelection } from "../lib/posDiscountRules.js";

const plain = { id: "coffee", name: "Coffee", unitPrice: 100, quantity: 1, variantDetails: "", instructions: "", cartItemId: 1 };
const senior = (id, cartItemId) => ({
  ...plain, cartItemId, discountRuleId: "senior-rule", discountAmount: 20,
  requiresDiscountBeneficiary: true, discountEntitlementGroup: "drink",
  discountBeneficiaryId: id, discountBeneficiaryName: id,
  discountBeneficiaryType: "senior_citizen", discountBeneficiaryIdNumber: `ID-${id}`,
});
const first = senior("Alice", 2);
const second = senior("Bob", 3);
const pwd = { ...senior("Carol", 4), discountRuleId: "pwd-rule", discountBeneficiaryType: "pwd" };
const qcid = {
  ...senior("Dina", 8), discountRuleId: "qcid-rule", discountBeneficiaryType: "qcid",
  discountBeneficiaryResidency: "resident", discountEntitlementGroup: "food",
};

let cart = [first];
cart = addPosCartLine(cart, second);
cart = addPosCartLine(cart, pwd);
assert.deepEqual(cart, [first, second, pwd], "Same item retains separate Senior and PWD IDs");
assert.equal(cart.reduce((sum, line) => sum + line.unitPrice * line.quantity - line.discountAmount, 0), 240);
assert.deepEqual(addPosCartLine([plain], first), [plain, first], "Discount survives adding to a regular item");
assert.deepEqual(addPosCartLine([first], plain), [first, plain], "Regular item cannot merge into a discounted item");
assert.deepEqual(addPosCartLine([plain], { ...plain, cartItemId: 5, quantity: 2 }), [{ ...plain, quantity: 3 }]);
assert.deepEqual(addPosCartLine(cart, { ...second, discountBeneficiaryId: "David" }, 1).map(line => line.discountBeneficiaryId), ["Alice", "David", "Carol"]);
assert.equal(addPosCartLine([plain], { ...plain, unitPrice: 120 }).length, 2);
assert.equal(addPosCartLine([{ ...plain, appliedVoucher: { id: "voucher" } }], plain).length, 2);
assert.equal(addPosCartLine([plain], { ...plain, discount_amount: 10 }).length, 2);

const split = addPosCartLine([plain, second], {
  ...plain, quantity: 3, discountRuleId: "item-rule", discountAmount: 20,
  discountBeneficiaryId: "Alice", selectedOptions: [{ id: "option" }], instructions: "Separate packing",
}, 0);
assert.deepEqual(split.map(line => line.quantity), [1, 2, 1], "Edit splits one discounted unit and keeps other lines");
assert.equal(split[0].cartItemId, plain.cartItemId);
assert.notEqual(split[1].cartItemId, split[0].cartItemId);
assert.equal(split[1].discountAmount, 0);
assert.equal(split[1].discountRuleId, undefined);
assert.equal(split[1].discountBeneficiaryId, undefined);
assert.deepEqual(split[1].selectedOptions, split[0].selectedOptions);
assert.equal(split[1].instructions, "Separate packing");
assert.equal(split.slice(0, 2).reduce((sum, line) => sum + line.unitPrice * line.quantity - line.discountAmount, 0), 280);
assert.equal(addPosCartLine([], { ...first, quantity: 2 }).length, 2, "New discounted items also split");
assert.equal(addPosCartLine([plain], { ...plain, quantity: 2 }, 0).length, 1, "Regular edits remain grouped");

// Exercise the actual checkout claim collector without importing the Next page.
const page = readFileSync(new URL("../app/pos/page.jsx", import.meta.url), "utf8");
const start = page.indexOf("function lineGrossAmount(");
const end = page.indexOf("function lineNetAmount(", start);
assert.ok(start >= 0 && end > start);
const collectClaims = vm.runInNewContext(`${page.slice(start, end)}; collectPosDiscountClaims;`, { isRegularDrinkSelection });
const restoredCart = JSON.parse(JSON.stringify(cart));
const claims = JSON.parse(JSON.stringify(collectClaims(restoredCart)));
assert.deepEqual(claims.map(claim => claim.beneficiary_id), ["Alice", "Bob", "Carol"]);
assert.deepEqual(claims.map(claim => claim.discount_id), ["senior-rule", "senior-rule", "pwd-rule"]);
assert.throws(() => collectClaims(addPosCartLine([first], { ...first, cartItemId: 6 })), /only one drink item per day/);
assert.equal(collectClaims([first, { ...first, cartItemId: 7, discountEntitlementGroup: "food" }]).length, 2);
assert.equal(collectClaims([first, { ...first, voided: true }]).length, 1);
assert.equal(collectClaims([{ ...first, quantity: 3 }]).length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(collectClaims([qcid]))), [{ beneficiary_id: "Dina", discount_id: "qcid-rule", entitlement_group: "food", regular_size: isRegularDrinkSelection([]) }]);
console.log("POS group discounts verified: separate IDs, totals, editing, regular items, saved data, and entitlement claims.");
