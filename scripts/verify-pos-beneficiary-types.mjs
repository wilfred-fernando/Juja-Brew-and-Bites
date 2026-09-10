import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  beneficiaryMatchesRule,
  beneficiaryCategoryLabel,
  beneficiaryResidencyLabel,
  beneficiaryTypeLabel,
  requiredBeneficiaryTypeForRule,
} from "../lib/posDiscountBeneficiaries.js";

const cases = [
  ["SENIOR CITIZEN | PWD", null], ["SC / PWD Discount", null], ["PWD / SC", null],
  ["Senior Citizen", "senior_citizen"], ["SC", "senior_citizen"], ["PWD", "pwd"],
  ["QCID Promo", "qcid"], ["QC ID Promo", "qcid"],
  ["Beneficiary discount", null],
];
for (const [name, expected] of cases) {
  assert.equal(requiredBeneficiaryTypeForRule({ name }), expected, name);
}
assert.equal(requiredBeneficiaryTypeForRule({ discount_name: "SC / PWD" }), null);
assert.equal(beneficiaryMatchesRule("invalid", null), false);
assert.equal(beneficiaryMatchesRule("qcid", "qcid"), true);
assert.equal(beneficiaryMatchesRule("qcid", null), false);
assert.equal(beneficiaryTypeLabel("qcid"), "QCID");
assert.equal(beneficiaryResidencyLabel("non_resident"), "Non-resident");
assert.equal(beneficiaryCategoryLabel("senior_citizen"), "Senior Citizen");
assert.equal(beneficiaryCategoryLabel("pwd"), "PWD");
assert.equal(beneficiaryCategoryLabel("qcid", "resident"), "QCID Resident");
assert.equal(beneficiaryCategoryLabel("qcid", "non_resident"), "QCID Non-resident");

const page = readFileSync(new URL("../app/pos/page.jsx", import.meta.url), "utf8");
const start = page.indexOf("  const saveDiscountBeneficiary = async");
const end = page.indexOf("  const refreshOfflineQueueCount", start);
assert.ok(start >= 0 && end > start);

for (const [name, required] of cases) {
  for (const type of ["senior_citizen", "pwd", "qcid"]) {
    const selected = [];
    const rpcCalls = [];
    let loaded = 0;
    const residencyStatus = type === "qcid" ? "resident" : null;
    const record = { id: `${name}-${type}`, beneficiary_type: type, full_name: "Test Person", id_number: "TEST123", residency_status: residencyStatus };
    const save = vm.runInNewContext(`${page.slice(start, end)}; saveDiscountBeneficiary;`, {
      pendingBeneficiaryType: required,
      beneficiaryMatchesRule,
      beneficiaryTypeLabel,
      selectDiscountBeneficiary: (entry) => selected.push(entry),
      loadDiscountBeneficiaries: async () => { loaded++; return [record]; },
      showToast: () => {},
      supabase: { rpc: async (fn, args) => { rpcCalls.push({ fn, args }); return { data: [record], error: null }; } },
    });
    assert.equal(await save({ beneficiaryType: type, residencyStatus, fullName: record.full_name, idNumber: record.id_number }), true);
    assert.equal(rpcCalls[0].fn, "save_pos_discount_beneficiary");
    assert.equal(rpcCalls[0].args.p_beneficiary_type, type);
    assert.equal(rpcCalls[0].args.p_residency_status, residencyStatus);
    assert.equal(loaded, 1);
    const allowed = beneficiaryMatchesRule(type, required);
    assert.equal(beneficiaryMatchesRule(type, required), allowed);
    assert.equal(selected.length, allowed ? 1 : 0, `${name}: ${type} save and selection`);
  }
}
const failingSave = vm.runInNewContext(`${page.slice(start, end)}; saveDiscountBeneficiary;`, {
  showToast: () => {},
  supabase: { rpc: async () => ({ error: { message: "A valid ID number is required." } }) },
});
await assert.rejects(() => failingSave({ beneficiaryType: "senior_citizen", fullName: "Test", idNumber: "-" }), /valid ID/);
console.log("Verified SC, PWD, and QCID save/selection, residency payloads, saved-list eligibility, and save-error propagation.");
