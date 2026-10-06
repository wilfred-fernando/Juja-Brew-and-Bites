"use client";

import { appendKdsTicketItems } from "./kds";
import { enqueueOutbox, listPendingOutbox, markOutboxFailed, markOutboxSynced } from "./localData";

// Serialize immediate sends and background retries on this POS instance.
let pendingWork = Promise.resolve();
function serial(work) {
  // Browser tabs share IndexedDB, so also share a lock when Web Locks exists.
  const run = () => globalThis.navigator?.locks?.request
    ? globalThis.navigator.locks.request("juja-kds-additions", work)
    : work();
  const result = pendingWork.then(run, run);
  pendingWork = result.catch(() => {});
  return result;
}

async function flush(supabase, storeId) {
  const queue = await listPendingOutbox({ entityType: "pos_kds_additions", limit: 10000 });
  for (const entry of queue) {
    if (String(entry.store_id) !== String(storeId)) continue;
    try {
      const result = await appendKdsTicketItems(supabase, entry.payload);
      if (result.error) throw result.error;
      if (!result.data) throw new Error("KDS did not acknowledge the kitchen items.");
      await markOutboxSynced(entry.id);
    } catch (error) {
      await markOutboxFailed(entry.id, error);
      // Keep batches in order, including across ticket closure and page reloads.
      return { error: new Error(`Kitchen items are waiting to sync. Keep this POS open; it will retry automatically. ${error.message || error}`) };
    }
  }
  return { error: null };
}

export function retryKdsAdditions(supabase, storeId) {
  return serial(() => flush(supabase, storeId));
}

export function queueKdsAdditions(supabase, args) {
  return serial(async () => {
    if (!args?.order?.store_id || !args?.order?.id || !args?.items?.length) {
      return { error: new Error("Kitchen items could not be queued: ticket or branch is missing.") };
    }
    try {
      await enqueueOutbox({
        entityType: "pos_kds_additions",
        operation: "append",
        storeId: args.order.store_id,
        payload: { ...args, batchId: args.batchId || globalThis.crypto.randomUUID() },
      });
      return await flush(supabase, args.order.store_id);
    } catch (error) {
      return { error };
    }
  });
}
