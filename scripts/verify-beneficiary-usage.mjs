import assert from "node:assert/strict";
import { loadBeneficiaryUsage } from "../lib/server/beneficiary-usage.js";

const base = { beneficiary_id: "angelica", receipt_number: "P6824017", store_id: "pasong", business_date: "2026-09-02", order_id: null, claim_key: "claim" };
const rows = [base, { ...base }, ...Array.from({ length: 499 }, (_, i) => ({ ...base, receipt_number: `other-${i}` }))];
const calls = [];
const query = {
  select() { return this; }, in(key, ids) { calls.push([key, ids]); return this; },
  eq(key, value) { assert.equal(key, "status"); assert.equal(value, "completed"); return this; },
  order(key) { assert.equal(key, "id"); return this; },
  async range(from, to) { calls.push([from, to]); return { data: rows.slice(from, to + 1), error: null }; },
};
const admin = { from(table) { assert.equal(table, "pos_discount_redemptions"); return query; } };
assert.equal((await loadBeneficiaryUsage(admin, ["angelica"])).get("angelica"), 500, "Multiple entitlements count once and all pages are included");
assert.ok(calls.some(([from]) => from === 500));
rows.splice(2);
assert.equal((await loadBeneficiaryUsage(admin, ["angelica", "unused"])).get("angelica"), 1);
assert.equal((await loadBeneficiaryUsage(admin, ["unused"])).get("unused"), 0);
rows.push({ ...base, store_id: "diliman" });
assert.equal((await loadBeneficiaryUsage(admin, ["angelica"])).get("angelica"), 2);
rows.push({ ...base, receipt_number: null }, { ...base, receipt_number: null });
assert.equal((await loadBeneficiaryUsage(admin, ["angelica"])).get("angelica"), 3, "Missing receipt numbers use the claim identity");
query.range = async () => ({ error: new Error("Unavailable") });
await assert.rejects(loadBeneficiaryUsage(admin, ["angelica"]), /Unavailable/);
console.log("Beneficiary usage verified: distinct completed receipts, archive identity, pagination, separate stores, unused beneficiaries, and error handling.");
