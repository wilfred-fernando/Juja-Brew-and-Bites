import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { beneficiaryMatchesRule, requiredBeneficiaryTypeForRule } from "../lib/posDiscountBeneficiaries.js";

const cases = [
  ["SENIOR CITIZEN | PWD", null], ["SC / PWD Discount", null], ["PWD / SC", null],
  ["Senior Citizen", "senior_citizen"], ["SC", "senior_citizen"], ["PWD", "pwd"],
  ["Beneficiary discount", null],
];
for (const [name, expected] of cases) {
  assert.equal(requiredBeneficiaryTypeForRule({ name }), expected, name);
}
assert.equal(requiredBeneficiaryTypeForRule({ discount_name: "SC / PWD" }), null);
assert.equal(beneficiaryMatchesRule("invalid", null), false);

const page = readFileSync(new URL("../app/pos/page.jsx", import.meta.url), "utf8");
const start = page.indexOf("  const saveDiscountBeneficiary = async");
const end = page.indexOf("  const refreshOfflineQueueCount", start);
assert.ok(start >= 0 && end > start);

for (const [name, required] of cases) {
  for (const type of ["senior_citizen", "pwd"]) {
    const selected = [];
    const rpcCalls = [];
    let loaded = 0;
    const record = { id: `${name}-${type}`, beneficiary_type: type, full_name: "Test Person", id_number: "TEST123" };
    const save = vm.runInNewContext(`${page.slice(start, end)}; saveDiscountBeneficiary;`, {
      pendingBeneficiaryType: required,
      beneficiaryMatchesRule,
      selectDiscountBeneficiary: (entry) => selected.push(entry),
      loadDiscountBeneficiaries: async () => { loaded++; return [record]; },
      showToast: () => {},
      supabase: { rpc: async (fn, args) => { rpcCalls.push({ fn, args }); return { data: [record], error: null }; } },
    });
    assert.equal(await save({ beneficiaryType: type, fullName: record.full_name, idNumber: record.id_number }), true);
    assert.equal(rpcCalls[0].fn, "save_pos_discount_beneficiary");
    assert.equal(rpcCalls[0].args.p_beneficiary_type, type);
    assert.equal(loaded, 1);
    const allowed = !required || required === type;
    assert.equal(beneficiaryMatchesRule(type, required), allowed);
    assert.equal(selected.length, allowed ? 1 : 0, `${name}: ${type} save and selection`);
  }
}
const failingSave = vm.runInNewContext(`${page.slice(start, end)}; saveDiscountBeneficiary;`, {
  showToast: () => {},
  supabase: { rpc: async () => ({ error: { message: "A valid ID number is required." } }) },
});
await assert.rejects(() => failingSave({ beneficiaryType: "senior_citizen", fullName: "Test", idNumber: "-" }), /valid ID/);
console.log("Verified SC and PWD save/selection for combined and individual rules, saved-list eligibility, and save-error propagation.");
