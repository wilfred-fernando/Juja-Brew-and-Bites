import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const memberId = "11111111-1111-4111-8111-111111111111";
const oldId = "22222222-2222-4222-8222-222222222222";
const calls = [];
const member = { id: memberId, customer_name: "New Name", customer_code: "OLD-CARD", user_id: "user" };
const admin = {
  from(table) {
    const query = {
      select() { return query; }, eq() { return query; }, in() { return query; },
      order() { return query; }, limit() { return query; }, ilike() { return query; },
      maybeSingle() { return Promise.resolve({ data: table === "profiles" ? { role: "admin" } : member }); },
      then(resolve, reject) {
        const data = table === "loyalty_member_merge_aliases"
          ? [{ source_id: oldId, source_snapshot: { id: oldId, customer_name: "Original Name", customer_code: "NEWER-CARD" } }]
          : [];
        return Promise.resolve({ data }).then(resolve, reject);
      },
    };
    return query;
  },
};
const receipt = (id, number) => ({ id, receipt_number: number, total: 100, created_at: "2026-10-01T00:00:00Z", _archive_source_type: "POS" });
const source = readFileSync(new URL("../app/api/admin/customer-purchase-history/route.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace("export async function POST", "async function POST");
const { POST } = vm.runInNewContext(`${source}; ({POST});`, {
  URL, Response, process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://db.example", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", D1_ARCHIVE_API_URL: "https://archive.example", D1_ARCHIVE_API_TOKEN: "test" } },
  cookies: async () => ({ getAll: () => [] }),
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "admin" } } }) } }),
  createSupabaseClient: () => admin,
  fetch: async (url) => {
    calls.push(new URL(url));
    const old = url.searchParams.get("memberId") === oldId;
    return Response.json({ rows: [receipt("33333333-3333-4333-8333-333333333333", "SHARED"), ...(old ? [receipt("44444444-4444-4444-8444-444444444444", "OLD-ONLY")] : [])] });
  },
});
const response = await POST({ json: async () => ({ memberId }) });
assert.equal(response.status, 200);
const payload = await response.json();
assert.equal(payload.rows.length, 2, "Both archived identities are included without duplicating shared receipts");
assert(payload.rows.some((row) => row.receipt === "OLD-ONLY"));
assert.deepEqual(calls.map((url) => url.searchParams.get("memberId")).sort(), [memberId, oldId]);
assert.equal(calls.find((url) => url.searchParams.get("memberId") === oldId).searchParams.get("customerCode"), "NEWER-CARD");
console.log("PASS: merged loyalty history searches both archive identities and keeps shared receipts only once.");
