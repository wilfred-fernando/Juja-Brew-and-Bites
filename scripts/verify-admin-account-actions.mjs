import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const actorId = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";
let actorRole, targetRole, authUser, writes, authError, denied;
const reset = () => {
  actorRole = "super_admin"; targetRole = "customer"; authError = null; denied = false; writes = [];
  authUser = { id: targetId, email: "old@example.com", email_confirmed_at: "2026-01-01", user_metadata: { full_name: "Old", contact_number: "09123456789", other: "preserved" } };
};
const admin = {
  from() {
    let id, patch;
    const query = {
      select() { return query; }, eq(key, value) { id = value; return query; },
      update(value) { patch = value; writes.push(["profile", value]); return query; },
      in() { return Promise.resolve({ data: [{ id: actorId, role: actorRole }, { id: targetId, role: targetRole }] }); },
      single() { return query.maybeSingle(); },
      maybeSingle() { return Promise.resolve({ data: patch || { role: id === actorId ? actorRole : targetRole, full_name: "Old" } }); },
    };
    return query;
  },
  auth: { admin: {
    async getUserById() { return { data: { user: authUser } }; },
    async updateUserById(id, patch) {
      if (authError) return { error: { message: authError } };
      writes.push(["auth", patch]); authUser = { ...authUser, ...patch };
      return { data: { user: authUser } };
    },
    async deleteUser(id, soft) { writes.push(["delete", id, soft]); return {}; },
  } },
};
const source = readFileSync(new URL("../app/api/admin/accounts/route.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace(/export async function/g, "async function");
const api = vm.runInNewContext(`${source}; ({PATCH, DELETE});`, {
  Response, clearCached() {}, requireAdminApi: async () => denied
    ? { response: Response.json({ error: "Admin access required" }, { status: 403 }) }
    : { admin, user: { id: actorId } },
});
const request = (body) => ({ json: async () => body });
const edit = { id: targetId, action: "edit", full_name: " New Name ", email: "NEW@example.com", contact_number: "+63 912 345 6789", role: "super_admin", password: "ignored" };
reset();
let result = await api.PATCH(request(edit));
assert.equal(result.status, 200);
assert.equal((await result.json()).account.email, "new@example.com");
assert.equal(authUser.user_metadata.other, "preserved");
assert.equal(authUser.email_confirmed_at, "2026-01-01");
assert.deepEqual(Object.keys(writes[0][1]).sort(), ["email", "user_metadata"]);
assert.deepEqual(Object.keys(writes[1][1]), ["full_name"]);
reset(); authError = "Email already registered";
assert.equal((await api.PATCH(request(edit))).status, 500);
assert.equal(writes.length, 0);
reset();
assert.equal((await api.PATCH(request({ ...edit, email: "invalid" }))).status, 400);
assert.equal(writes.length, 0);
reset(); actorRole = "admin"; targetRole = "super_admin";
assert.equal((await api.PATCH(request(edit))).status, 403);
assert.equal((await api.DELETE(request({ id: targetId }))).status, 403);
assert.equal(writes.length, 0);
reset();
assert.equal((await api.DELETE(request({ id: actorId }))).status, 400);
assert.equal(writes.length, 0);
assert.equal((await api.DELETE(request({ id: targetId }))).status, 200);
assert.deepEqual(writes[0], ["delete", targetId, true]);
reset(); actorRole = "admin"; targetRole = "customer";
assert.equal((await api.PATCH(request(edit))).status, 403);
assert.equal((await api.DELETE(request({ id: targetId }))).status, 403);
assert.equal(writes.length, 0);
targetRole = "admin";
assert.equal((await api.DELETE(request({ id: targetId }))).status, 403);
actorRole = "super_admin";
assert.equal((await api.DELETE(request({ id: targetId }))).status, 200);
reset(); denied = true;
assert.equal((await api.PATCH(request(edit))).status, 403);
assert.equal((await api.DELETE(request({ id: targetId }))).status, 403);
assert.equal(writes.length, 0);
console.log("PASS: account edits allow only name/email/contact, preserve metadata and confirmation, reject invalid or unauthorized writes, and soft-delete with admin/self protections. No live accounts changed.");
