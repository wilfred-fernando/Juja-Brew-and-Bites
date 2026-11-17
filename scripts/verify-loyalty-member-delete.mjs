import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const id = "22562a9a-f53e-4d18-bbac-4515b1e69a11";
let allowed = true, linked = false, deleted = true, dbError = null, mutations = 0;
const admin = { from(table) {
  const query = {
    select() { return query; }, eq() { return query; },
    is(column, value) { assert.equal(column, "user_id"); assert.equal(value, null); return query; },
    limit() { return Promise.resolve({ data: linked ? [{ id: "profile" }] : [] }); },
    delete() { assert.equal(table, "loyalty_members"); mutations++; return query; },
    maybeSingle() { return Promise.resolve({ data: deleted ? { id } : null, error: dbError }); },
  };
  return query;
} };
const source = readFileSync(new URL("../app/api/admin/loyalty-members/route.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace("export async function", "async function");
const { DELETE } = vm.runInNewContext(`${source}; ({DELETE});`, {
  Response, requireAdminApi: async () => allowed ? { admin } : { response: Response.json({}, { status: 403 }) },
});
const request = (value = id) => ({ json: async () => ({ id: value }) });
assert.equal((await DELETE(request())).status, 200);
deleted = false;
assert.equal((await DELETE(request())).status, 409, "Zero deleted rows must not report success");
linked = true; mutations = 0;
assert.equal((await DELETE(request())).status, 409);
assert.equal(mutations, 0, "Linked profiles must not be deleted");
linked = false; dbError = { code: "23503", message: "Foreign key violation" };
const related = await DELETE(request());
assert.equal(related.status, 400);
assert.match((await related.json()).error, /related records/);
mutations = 0;
assert.equal((await DELETE(request("invalid"))).status, 400);
allowed = false;
assert.equal((await DELETE(request())).status, 403);
assert.equal(mutations, 0);
console.log("PASS: authorized deletion verifies the returned row, rejects linked members, handles related history, and blocks invalid/unauthorized requests.");
