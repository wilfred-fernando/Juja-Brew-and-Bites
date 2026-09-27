import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Load the production helpers without requiring a browser or a live kitchen.
const source = await readFile(new URL("../lib/kds.js", import.meta.url), "utf8");
const { appendKdsTicketItems } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
let ticket = { id: "kds-1", status: "completed", items: [{ id: "old", name: "Sandwich", quantity: 1, kdsCompleted: true }] };
let writes = 0;
let loseResponse = false;
const supabase = { from() {
  let patch;
  return {
    select() { return this; }, eq() { return this; },
    update(value) { patch = value; return this; },
    async maybeSingle() {
      if (patch) {
        writes++;
        ticket = { ...ticket, ...patch };
        if (loseResponse) { loseResponse = false; return { error: new Error("Response lost") }; }
      }
      return { data: structuredClone(ticket), error: null };
    },
  };
} };
const args = { sourceType: "pos", order: { id: "saved-1", store_id: "branch-1" }, items: [
  { cartItemId: "snack-add-1", name: "Snack Platter", quantity: 2 },
  { cartItemId: "cornedbeef-add-1", name: "Cornedbeef Silog", quantity: 2 },
  { cartItemId: "sausage-add-1", name: "Sausage Silog", quantity: 1 },
] };
loseResponse = true;
assert.ok((await appendKdsTicketItems(supabase, args)).error);
ticket.items[1].kitchenReady = true;
assert.equal((await appendKdsTicketItems(supabase, args)).error, null);
assert.equal(writes, 1, "Lost response retry must not write the batch twice");
assert.equal(ticket.items.length, 4);
assert.equal(ticket.items[1].kitchenReady, true, "Retry preserves kitchen progress");
assert.equal(ticket.items[0].kdsCompleted, true);
assert.equal(ticket.status, "preparing");

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
