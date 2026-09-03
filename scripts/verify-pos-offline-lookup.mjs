import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { receiptLineMetadata } from "../lib/reports/receiptDetails.js";

const page = readFileSync(new URL("../app/pos/page.jsx", import.meta.url), "utf8");
const start = page.indexOf("  async function replayOfflineCharge(");
const end = page.indexOf("  async function syncOfflineCharges(", start);
assert.ok(start >= 0 && end > start);
const draft = { store_id: "diliman", idempotency_key: "offline-key", cart: [{ id: "coffee", quantity: 1, unitPrice: 100 }], total: 100, grossTotal: 100, sendToKds: false };

function harness({ existing = null, lookupError = null, receiptError = null, orderError = null, itemsError = null } = {}) {
  const calls = [];
  const context = {
    currentUserId: "cashier", getResolvedBranchId: () => "other-store",
    receiptLineMetadata,
    enrichOrderItemsForKds: (items) => items, paymentSplitEntries: () => [],
    lineNetAmount: () => 100, lineGrossAmount: () => 100, lineDiscountAmount: () => 0,
    deductInventoryForOrder: async () => {}, console,
    supabase: {
      from(table) {
        let inserted = false;
        const query = {
          select() { return query; },
          eq(column, value) { calls.push(["lookup", column, value]); return query; },
          maybeSingle: async () => ({ data: existing, error: lookupError }),
          insert(rows) { inserted = true; calls.push(["insert", table, rows]); return query; },
          single: async () => ({ data: orderError ? null : { id: "order", receipt_number: "D1234567" }, error: orderError }),
          then(resolve, reject) { return Promise.resolve({ error: inserted && table === "order_items" ? itemsError : null }).then(resolve, reject); },
        };
        return query;
      },
      rpc: async (name) => { calls.push(["rpc", name]); return { data: { receipt_number: "D1234567" }, error: receiptError }; },
    },
  };
  const replay = vm.runInNewContext(`${page.slice(start, end)}; replayOfflineCharge;`, context);
  return { replay, calls };
}

const reused = harness({ existing: { id: "already-uploaded", receipt_number: "D7654321" } });
assert.equal((await reused.replay(draft)).orderRow.id, "already-uploaded");
assert.equal(reused.calls.length, 1, "Finding the existing upload must not create another sale");
assert.deepEqual(reused.calls[0], ["lookup", "client_idempotency_key", "offline-key"]);

const fresh = harness();
await fresh.replay(draft);
const insert = fresh.calls.find(([action, table]) => action === "insert" && table === "orders")[2][0];
assert.equal(insert.client_idempotency_key, "offline-key");
assert.equal(insert.source_metadata.offline_idempotency_key, "offline-key");
assert.equal(insert.store_id, "diliman");

for (const [field, stage] of [["lookupError", "Checking previously uploaded sale"], ["receiptError", "Generating receipt number"], ["orderError", "Saving offline sale"], ["itemsError", "Saving offline sale items"]]) {
  const failure = harness({ [field]: { message: "canceling statement due to statement timeout" } });
  await assert.rejects(() => failure.replay(draft), new RegExp(`${stage}: canceling statement due to statement timeout`));
  if (field === "lookupError") assert.equal(failure.calls.length, 1, "A failed duplicate check must not proceed to inserting");
}
console.log("Offline lookup verified: indexed key, existing-order reuse, Diliman branch retention, persisted sync identity, and per-operation errors.");
