import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Load the production helpers without requiring a browser or a live kitchen.
const source = await readFile(new URL("../lib/kds.js", import.meta.url), "utf8");
const { appendKdsTicketItems } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const original = { id: "old-kds", source_id: "saved-1", status: "preparing", items: [{ id: "old", name: "SPAM Kimchi Rice", quantity: 1, kdsCompleted: false }] };
const originalSnapshot = structuredClone(original);
const records = new Map([["saved-1", original]]);
let writes = 0;
let loseResponse = false;
const supabase = { from() {
  let sourceId;
  return {
    select() { return this; },
    eq(field, value) { if (field === "source_id") sourceId = value; return this; },
    async upsert(payload, options) {
      assert.equal(options.ignoreDuplicates, true);
      if (!records.has(payload.source_id)) { records.set(payload.source_id, { ...structuredClone(payload), id: `kds-${++writes}` }); }
      if (loseResponse) { loseResponse = false; return { error: new Error("Response lost") }; }
      return { error: null };
    },
    async maybeSingle() { return { data: structuredClone(records.get(sourceId)), error: null }; },
  };
} };
const args = { sourceType: "pos", batchId: "batch-one", order: { id: "saved-1", store_id: "branch-1" }, items: [
  { cartItemId: "chicken-add-1", name: "Boneless Chicken", quantity: 1 },
] };
loseResponse = true;
assert.ok((await appendKdsTicketItems(supabase, args)).error);
const batch = records.get("saved-1:batch:batch-one");
batch.items[0].kitchenReady = true;
assert.equal((await appendKdsTicketItems(supabase, args)).error, null);
assert.equal(writes, 1, "Lost response retry must not create another batch");
assert.equal(batch.items[0].kitchenReady, true, "Retry preserves kitchen progress");
assert.deepEqual(original, originalSnapshot, "Earlier pending order is untouched");
await appendKdsTicketItems(supabase, { ...args, batchId: "batch-two", items: [{ cartItemId: "beef-add-1", name: "Beef Pepper Rice", quantity: 1 }] });
assert.equal(records.size, 3, "Every addition has its own kitchen order");
assert.equal(records.get("saved-1:batch:batch-two").items.length, 1);
assert.equal(original.items[0].kdsCompleted, false);

let queue = [];
let fail = true;
let sends = [];
const dependencies = {
  appendKdsTicketItems: async (_client, payload) => {
    sends.push(payload.order.id);
    return fail ? { error: new Error("Disconnected") } : { data: { id: "ack" } };
  },
  enqueueOutbox: async (entry) => { queue.push({ ...entry, id: String(queue.length), store_id: entry.storeId }); },
  listPendingOutbox: async () => queue.filter((entry) => !entry.synced),
  markOutboxFailed: async () => {},
  markOutboxSynced: async (id) => { queue.find((entry) => entry.id === id).synced = true; },
};
globalThis.__kdsTestDependencies = dependencies;
const outboxSource = (await readFile(new URL("../lib/kdsOutbox.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "");
const loadOutbox = async (tag) => import(`data:text/javascript;base64,${Buffer.from(
  `const { appendKdsTicketItems, enqueueOutbox, listPendingOutbox, markOutboxFailed, markOutboxSynced } = globalThis.__kdsTestDependencies;\n${outboxSource}\n//${tag}`
).toString("base64")}`);
const first = await loadOutbox("first");
assert.ok((await first.queueKdsAdditions({}, args)).error);
assert.equal(queue.length, 1, "Failed batch remains durable");
fail = false;
const reloaded = await loadOutbox("reload");
await reloaded.retryKdsAdditions({}, "another-branch");
assert.equal(sends.length, 1, "Other branch cannot replay the batch");
await Promise.all([reloaded.retryKdsAdditions({}, "branch-1"), reloaded.retryKdsAdditions({}, "branch-1")]);
assert.equal(sends.length, 2, "Concurrent retry triggers are serialized");
assert.equal(queue[0].synced, true, "Reload resumes persisted batch");
delete globalThis.__kdsTestDependencies;
console.log("PASS: missing food additions, lost response deduplication, kitchen progress, durable retry, branch isolation, concurrent retry serialization");
