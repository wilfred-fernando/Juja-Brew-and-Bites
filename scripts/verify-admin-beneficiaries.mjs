import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { formatBeneficiaryName } from "../lib/beneficiaryName.js";

const source = readFileSync(new URL("../app/api/admin/discount-beneficiaries/route.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace(/export async function/g, "async function");
let denied = null;
let result = { data: [], count: 0, error: null };
let resultQueue = [];
let calls = [];
const query = {};
for (const method of ["select", "eq", "or", "order", "range", "update", "delete", "maybeSingle"]) {
  query[method] = (...args) => { calls.push([method, ...args]); return query; };
}
query.then = (resolve, reject) => Promise.resolve(resultQueue.length ? resultQueue.shift() : result).then(resolve, reject);
const handlers = vm.runInNewContext(`${source}; ({ GET, PATCH, DELETE });`, {
  Response, URL, formatBeneficiaryName,
  loadBeneficiaryUsage: async () => new Map([["00000000-0000-4000-8000-000000000001", 3]]),
  requireAdminApi: async () => denied ? { response: denied } : { admin: {
    from: (table) => { calls.push(["from", table]); return query; },
  } },
});
const body = {
  id: "00000000-0000-4000-8000-000000000001", full_name: "  Ana   Cruz  ",
  beneficiary_type: "pwd", id_number: " ab-123 ", updated_at: "2026-09-03T01:00:00.000Z",
};
const patch = (payload) => handlers.PATCH(new Request("http://localhost/api/admin/discount-beneficiaries", {
  method: "PATCH", body: JSON.stringify(payload), headers: { "Content-Type": "application/json" },
}));
const remove = (payload) => handlers.DELETE(new Request("http://localhost/api/admin/discount-beneficiaries", {
  method: "DELETE", body: JSON.stringify(payload), headers: { "Content-Type": "application/json" },
}));

for (const status of [401, 403]) {
  denied = Response.json({ error: "Access denied" }, { status });
  calls = [];
  assert.equal((await handlers.GET(new Request("http://localhost/api/admin/discount-beneficiaries"))).status, status);
  assert.equal((await patch(body)).status, status);
  assert.equal((await remove(body)).status, status);
  assert.equal(calls.length, 0, "Unauthorized requests must not access beneficiaries");
}
denied = null;
for (const invalid of [{ ...body, id: "bad" }, { ...body, full_name: " " }, { ...body, full_name: {} }, { ...body, beneficiary_type: "other" }, { ...body, id_number: "---" }, { ...body, updated_at: null }]) {
  calls = [];
  assert.equal((await patch(invalid)).status, 400);
  assert.equal(calls.length, 0);
}
result = { data: { ...body, full_name: "Ana Cruz", id_number: "ab-123" }, error: null };
calls = [];
const saved = await patch({ ...body, full_name: "  aNA   MARIE o'CRUZ-smith  ", is_active: false, created_by: "untrusted", normalized_id_number: "untrusted" });
assert.equal(saved.status, 200);
const update = calls.find(([method]) => method === "update")[1];
assert.equal(update.full_name, "Ana Marie O'Cruz-Smith");
assert.equal(update.normalized_id_number, "AB123");
assert.equal(update.beneficiary_type, "pwd");
assert.equal(update.id_number, "ab-123");
assert.deepEqual(Object.keys(update).sort(), ["beneficiary_type", "full_name", "id_number", "normalized_id_number", "updated_at"]);
assert.ok(calls.some(([method, key, value]) => method === "eq" && key === "id" && value === body.id));
assert.ok(calls.some(([method, key, value]) => method === "eq" && key === "updated_at" && value === body.updated_at));
assert.ok(calls.filter(([method]) => method === "from").every(([, table]) => table === "pos_discount_beneficiaries"));
result = { data: null, error: { code: "23505" } };
assert.equal((await patch(body)).status, 409, "Duplicate IDs must be rejected");
result = { data: null, error: null };
assert.equal((await patch(body)).status, 409, "Stale edits must be rejected");

calls = [];
result = { data: [body], count: 26, error: null };
const listed = await handlers.GET(new Request("http://localhost/api/admin/discount-beneficiaries?q=ab-123&type=pwd&page=2"));
assert.equal(listed.status, 200);
assert.equal(listed.headers.get("cache-control"), "private, no-store");
const listedBody = await listed.json();
assert.equal(listedBody.total, 26);
assert.equal(listedBody.beneficiaries[0].times_used, 3);
assert.ok(calls.some(([method, from, to]) => method === "range" && from === 25 && to === 49));
assert.ok(calls.some(([method, key, value]) => method === "eq" && key === "beneficiary_type" && value === "pwd"));
assert.ok(calls.some(([method, key, value]) => method === "eq" && key === "is_active" && value === true));
assert.ok(calls.some(([method, value]) => method === "or" && value.includes("normalized_id_number.ilike.%AB123%")));
assert.equal((await handlers.GET(new Request("http://localhost/api/admin/discount-beneficiaries?type=other"))).status, 400);
calls = [];
await handlers.GET(new Request("http://localhost/api/admin/discount-beneficiaries?status=inactive"));
assert.ok(calls.some(([method, key, value]) => method === "eq" && key === "is_active" && value === false));
calls = [];
await handlers.GET(new Request("http://localhost/api/admin/discount-beneficiaries?status=all"));
assert.ok(!calls.some(([method, key]) => method === "eq" && key === "is_active"));
assert.equal((await handlers.GET(new Request("http://localhost/api/admin/discount-beneficiaries?status=invalid"))).status, 400);
assert.equal(formatBeneficiaryName("  mARK   lESTER arCE "), "Mark Lester Arce");

calls = [];
assert.equal((await remove({ ...body, id: "bad" })).status, 400);
assert.equal(calls.length, 0);
result = { data: null, count: 2, error: null };
assert.equal((await remove(body)).status, 409, "Beneficiaries with purchases cannot be deleted");
assert.ok(!calls.some(([method]) => method === "delete"));
calls = [];
resultQueue = [{ data: null, count: 0, error: null }, { data: null, error: { code: "23503" } }];
assert.equal((await remove(body)).status, 409, "A concurrent purchase prevents deletion");
calls = [];
resultQueue = [{ data: null, count: 0, error: null }, { data: null, error: null }];
assert.equal((await remove(body)).status, 409, "Stale deletes must be rejected");
calls = [];
resultQueue = [{ data: null, count: 0, error: null }, { data: body, error: null }];
const deleted = await remove(body);
assert.equal(deleted.status, 200);
assert.equal((await deleted.json()).deleted, body.id);
assert.ok(calls.some(([method]) => method === "delete"));
assert.ok(calls.some(([method, key, value]) => method === "eq" && key === "updated_at" && value === body.updated_at));
console.log("Admin beneficiaries verified: access denial, pagination, filtering, validation, normalization, duplicate IDs, and stale-edit protection.");
