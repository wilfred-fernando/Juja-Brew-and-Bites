import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const page = readFileSync(new URL("../app/pos/page.jsx", import.meta.url), "utf8");
const start = page.indexOf("  async function syncOfflineCharges(");
const end = page.indexOf("  useEffect(", start);
assert.ok(start >= 0 && end > start);
const queue = [{ id: "diliman-queued-sale", payload: { idempotency_key: "stable-sale-key" }, last_error: null }];
const running = { current: false };
let replayCount = 0;
let shouldFail = true;
let sessionValid = true;
let visibleError = "";
let syncing = false;
let releaseReplay;
let pauseReplay = false;
const context = {
  localDataReady: true, currentUserId: "cashier", storeId: "diliman",
  navigator: { onLine: true }, offlineSyncRunningRef: running,
  setOfflineSyncing: (value) => { syncing = value; },
  setOfflineSyncError: (value) => { visibleError = value; },
  setOfflineQueueCount: () => {}, setIsOfflineMode: () => {},
  listPendingOutbox: async () => [...queue],
  getStableSession: async () => ({ session: sessionValid ? { user: { id: "cashier" } } : null }),
  supabase: {},
  replayOfflineCharge: async (payload) => {
    assert.equal(payload.idempotency_key, "stable-sale-key");
    replayCount++;
    if (pauseReplay) await new Promise((resolve) => { releaseReplay = resolve; });
    if (shouldFail) throw new Error("Failed to fetch");
  },
  markOutboxSynced: async (id) => { assert.equal(id, queue[0].id); queue.shift(); },
  markOutboxFailed: async (id, message) => { assert.equal(id, queue[0].id); queue[0].last_error = message; },
  isProbablyOfflineError: () => true,
  refreshOfflineQueueCount: async () => { visibleError = queue[0]?.last_error || ""; },
  fetchReceiptLogs: async () => {}, showToast: () => {}, console: { warn: () => {} },
};
const sync = vm.runInNewContext(`${page.slice(start, end)}; syncOfflineCharges;`, context);
await sync();
assert.equal(queue.length, 1, "A failed upload must retain the device's sale");
assert.equal(visibleError, "Failed to fetch");
assert.equal(running.current, false);
assert.equal(syncing, false);

sessionValid = false;
await sync();
assert.equal(replayCount, 1, "Missing authentication must not replay sales");
assert.match(visibleError, /Sign in again/);
sessionValid = true;
context.localDataReady = false;
await sync();
assert.equal(replayCount, 1);
context.localDataReady = true;

// Timer and manual retries can arrive together; only one may replay the sale.
shouldFail = false;
pauseReplay = true;
const firstRetry = sync();
while (!releaseReplay) await Promise.resolve();
await sync();
assert.equal(replayCount, 2);
assert.equal(syncing, true);
releaseReplay();
await firstRetry;
assert.equal(queue.length, 0);
assert.equal(visibleError, "");
assert.equal(running.current, false);
assert.equal(syncing, false);

// Exercise the actual retry effect: startup, timer, focus, resume and cleanup.
const marker = page.indexOf("    if (!localDataReady || !currentUserId || !storeId) return;");
const effectStart = page.lastIndexOf("  useEffect(() => {", marker);
const effectEnd = page.indexOf("  }, [localDataReady, currentUserId, storeId]);", marker);
assert.ok(marker >= 0 && effectStart >= 0 && effectEnd > marker);
let retries = 0;
let timer;
let intervalMs;
let cleared = false;
let cleanup;
const events = new Map();
const scheduler = {
  localDataReady: true, currentUserId: "cashier", storeId: "diliman",
  navigator: { onLine: true }, syncOfflineChargesRef: { current: () => { retries++; } },
  useEffect: (callback) => { cleanup = callback(); },
  window: {
    setInterval: (callback, ms) => { timer = callback; intervalMs = ms; return 1; },
    clearInterval: () => { cleared = true; },
    addEventListener: (event, callback) => events.set(event, callback),
    removeEventListener: (event) => events.delete(event),
  },
  document: {
    visibilityState: "visible",
    addEventListener: (event, callback) => events.set(event, callback),
    removeEventListener: (event) => events.delete(event),
  },
};
vm.runInNewContext(page.slice(effectStart, effectEnd) + "  }, [localDataReady, currentUserId, storeId]);", scheduler);
assert.equal(retries, 1);
assert.equal(intervalMs, 30000);
timer(); events.get("focus")(); events.get("visibilitychange")();
assert.equal(retries, 4);
scheduler.navigator.onLine = false;
timer();
assert.equal(retries, 4);
cleanup();
assert.equal(cleared, true);
assert.equal(events.size, 0);
console.log("Offline sync verified: failed-sale retention, visible errors, auth readiness, retry recovery, overlapping retry guard, timer/resume and cleanup.");
