"use client";

import { Capacitor } from "@capacitor/core";

const DATABASE_NAME = "juja_local";
const DATABASE_VERSION = 1;
const INDEXED_DB_NAME = "juja-local-data";
const INDEXED_DB_VERSION = 1;
const EMPTY_IDENTITY = "";

let nativeDatabasePromise = null;
let indexedDatabasePromise = null;

const nowIso = () => new Date().toISOString();

function safeJsonParse(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

function identityValue(value) {
  return value === null || value === undefined ? EMPTY_IDENTITY : String(value);
}

function snapshotKey(namespace, storeId, userId) {
  return `${namespace}::${identityValue(storeId)}::${identityValue(userId)}`;
}

function uuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function isNativeRuntime() {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

async function getNativeDatabase() {
  if (!isNativeRuntime()) return null;
  if (nativeDatabasePromise) return nativeDatabasePromise;

  nativeDatabasePromise = (async () => {
    const { CapacitorSQLite, SQLiteConnection } = await import("@capacitor-community/sqlite");
    const connection = new SQLiteConnection(CapacitorSQLite);
    const consistency = await connection.checkConnectionsConsistency().catch(() => ({ result: false }));
    const existing = await connection.isConnection(DATABASE_NAME, false).catch(() => ({ result: false }));
    let database;
    if (consistency?.result && existing?.result) {
      database = await connection.retrieveConnection(DATABASE_NAME, false);
    } else {
      database = await connection.createConnection(DATABASE_NAME, false, "no-encryption", DATABASE_VERSION, false);
    }
    await database.open();
    await database.execute(`
      CREATE TABLE IF NOT EXISTS local_cache (
        cache_key TEXT PRIMARY KEY NOT NULL,
        namespace TEXT NOT NULL,
        store_id TEXT NOT NULL DEFAULT '',
        user_id TEXT NOT NULL DEFAULT '',
        payload TEXT NOT NULL,
        source_updated_at TEXT,
        cached_at TEXT NOT NULL,
        expires_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_local_cache_scope
        ON local_cache(namespace, store_id, user_id, cached_at);
      CREATE TABLE IF NOT EXISTS sync_state (
        scope_key TEXT PRIMARY KEY NOT NULL,
        cursor TEXT,
        synced_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY NOT NULL,
        operation TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        store_id TEXT NOT NULL DEFAULT '',
        user_id TEXT NOT NULL DEFAULT '',
        payload TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_pending
        ON outbox(status, created_at);
    `);
    return database;
  })();

  return nativeDatabasePromise;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
}

async function getIndexedDatabase() {
  if (typeof window === "undefined" || !("indexedDB" in window)) return null;
  if (indexedDatabasePromise) return indexedDatabasePromise;

  indexedDatabasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("local_cache")) {
        const cache = database.createObjectStore("local_cache", { keyPath: "cache_key" });
        cache.createIndex("scope", ["namespace", "store_id", "user_id", "cached_at"]);
      }
      if (!database.objectStoreNames.contains("sync_state")) {
        database.createObjectStore("sync_state", { keyPath: "scope_key" });
      }
      if (!database.objectStoreNames.contains("outbox")) {
        const outbox = database.createObjectStore("outbox", { keyPath: "id" });
        outbox.createIndex("status_created", ["status", "created_at"]);
        outbox.createIndex("idempotency_key", "idempotency_key", { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open IndexedDB."));
  });

  return indexedDatabasePromise;
}

async function indexedStore(storeName, mode, callback) {
  const database = await getIndexedDatabase();
  if (!database) return null;
  const transaction = database.transaction(storeName, mode);
  const store = transaction.objectStore(storeName);
  const completed = new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted."));
  });
  const result = await callback(store);
  await completed;
  return result;
}

export async function initializeLocalData() {
  if (typeof window === "undefined") return "unavailable";
  if (isNativeRuntime()) {
    await getNativeDatabase();
    return "sqlite";
  }
  const database = await getIndexedDatabase();
  return database ? "indexeddb" : "unavailable";
}

export async function getLocalSnapshot(namespace, { storeId = "", userId = "", allowExpired = true } = {}) {
  const cacheKey = snapshotKey(namespace, storeId, userId);
  let row = null;
  if (isNativeRuntime()) {
    const database = await getNativeDatabase();
    const result = await database.query("SELECT * FROM local_cache WHERE cache_key = ? LIMIT 1", [cacheKey]);
    row = result?.values?.[0] || null;
  } else {
    row = await indexedStore("local_cache", "readonly", (store) => requestResult(store.get(cacheKey)));
  }
  if (!row) return null;
  if (!allowExpired && row.expires_at && Date.parse(row.expires_at) <= Date.now()) return null;
  return {
    data: safeJsonParse(row.payload, null),
    cachedAt: row.cached_at,
    sourceUpdatedAt: row.source_updated_at || null,
    expiresAt: row.expires_at || null,
  };
}

export function isLocalSnapshotFresh(snapshot, maxAgeMs) {
  if (!snapshot?.cachedAt || !Number.isFinite(Number(maxAgeMs))) return false;
  const cachedAt = Date.parse(snapshot.cachedAt);
  return Number.isFinite(cachedAt) && Date.now() - cachedAt < Number(maxAgeMs);
}

export async function setLocalSnapshot(
  namespace,
  data,
  { storeId = "", userId = "", sourceUpdatedAt = null, expiresAt = null } = {}
) {
  const row = {
    cache_key: snapshotKey(namespace, storeId, userId),
    namespace,
    store_id: identityValue(storeId),
    user_id: identityValue(userId),
    payload: JSON.stringify(data ?? null),
    source_updated_at: sourceUpdatedAt,
    cached_at: nowIso(),
    expires_at: expiresAt,
  };
  if (isNativeRuntime()) {
    const database = await getNativeDatabase();
    await database.run(
      `INSERT INTO local_cache(cache_key, namespace, store_id, user_id, payload, source_updated_at, cached_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         payload = excluded.payload,
         source_updated_at = excluded.source_updated_at,
         cached_at = excluded.cached_at,
         expires_at = excluded.expires_at`,
      [row.cache_key, row.namespace, row.store_id, row.user_id, row.payload, row.source_updated_at, row.cached_at, row.expires_at]
    );
  } else {
    await indexedStore("local_cache", "readwrite", (store) => requestResult(store.put(row)));
  }
  return row.cached_at;
}

export async function removeLocalSnapshot(namespace, { storeId = "", userId = "" } = {}) {
  const cacheKey = snapshotKey(namespace, storeId, userId);
  if (isNativeRuntime()) {
    const database = await getNativeDatabase();
    await database.run("DELETE FROM local_cache WHERE cache_key = ?", [cacheKey]);
  } else {
    await indexedStore("local_cache", "readwrite", (store) => requestResult(store.delete(cacheKey)));
  }
}

export async function getSyncCursor(scopeKey) {
  let row = null;
  if (isNativeRuntime()) {
    const database = await getNativeDatabase();
    const result = await database.query("SELECT cursor, synced_at FROM sync_state WHERE scope_key = ? LIMIT 1", [scopeKey]);
    row = result?.values?.[0] || null;
  } else {
    row = await indexedStore("sync_state", "readonly", (store) => requestResult(store.get(scopeKey)));
  }
  return row || null;
}

export async function setSyncCursor(scopeKey, cursor) {
  const row = { scope_key: scopeKey, cursor: cursor || null, synced_at: nowIso() };
  if (isNativeRuntime()) {
    const database = await getNativeDatabase();
    await database.run(
      `INSERT INTO sync_state(scope_key, cursor, synced_at) VALUES (?, ?, ?)
       ON CONFLICT(scope_key) DO UPDATE SET cursor = excluded.cursor, synced_at = excluded.synced_at`,
      [row.scope_key, row.cursor, row.synced_at]
    );
  } else {
    await indexedStore("sync_state", "readwrite", (store) => requestResult(store.put(row)));
  }
  return row;
}

export async function enqueueOutbox({ operation, entityType, payload, storeId = "", userId = "", idempotencyKey }) {
  const timestamp = nowIso();
  const row = {
    id: uuid(),
    operation,
    entity_type: entityType,
    store_id: identityValue(storeId),
    user_id: identityValue(userId),
    payload: JSON.stringify(payload ?? null),
    idempotency_key: idempotencyKey || uuid(),
    status: "pending",
    attempts: 0,
    created_at: timestamp,
    updated_at: timestamp,
    last_error: null,
  };
  if (isNativeRuntime()) {
    const database = await getNativeDatabase();
    await database.run(
      `INSERT OR IGNORE INTO outbox
       (id, operation, entity_type, store_id, user_id, payload, idempotency_key, status, attempts, created_at, updated_at, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.operation, row.entity_type, row.store_id, row.user_id, row.payload, row.idempotency_key, row.status, row.attempts, row.created_at, row.updated_at, row.last_error]
    );
  } else {
    const existing = await indexedStore("outbox", "readonly", (store) => requestResult(store.index("idempotency_key").get(row.idempotency_key)));
    if (!existing) await indexedStore("outbox", "readwrite", (store) => requestResult(store.put(row)));
  }
  return row;
}

export async function listPendingOutbox({ entityType = null, limit = 100 } = {}) {
  let rows = [];
  if (isNativeRuntime()) {
    const database = await getNativeDatabase();
    const sql = entityType
      ? "SELECT * FROM outbox WHERE status IN ('pending', 'failed') AND entity_type = ? ORDER BY created_at ASC LIMIT ?"
      : "SELECT * FROM outbox WHERE status IN ('pending', 'failed') ORDER BY created_at ASC LIMIT ?";
    const result = await database.query(sql, entityType ? [entityType, limit] : [limit]);
    rows = result?.values || [];
  } else {
    rows = (await indexedStore("outbox", "readonly", (store) => requestResult(store.getAll()))) || [];
    rows = rows
      .filter((row) => ["pending", "failed"].includes(row.status) && (!entityType || row.entity_type === entityType))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .slice(0, limit);
  }
  return rows.map((row) => ({ ...row, payload: safeJsonParse(row.payload, null) }));
}

export async function countPendingOutbox({ entityType = null } = {}) {
  const rows = await listPendingOutbox({ entityType, limit: 10000 });
  return rows.length;
}

async function patchOutbox(id, patch) {
  const updatedAt = nowIso();
  if (isNativeRuntime()) {
    const database = await getNativeDatabase();
    const current = await database.query("SELECT * FROM outbox WHERE id = ? LIMIT 1", [id]);
    const row = current?.values?.[0];
    if (!row) return null;
    const next = { ...row, ...patch, updated_at: updatedAt };
    await database.run(
      "UPDATE outbox SET status = ?, attempts = ?, updated_at = ?, last_error = ? WHERE id = ?",
      [next.status, next.attempts, next.updated_at, next.last_error || null, id]
    );
    return next;
  }
  return indexedStore("outbox", "readwrite", async (store) => {
    const row = await requestResult(store.get(id));
    if (!row) return null;
    const next = { ...row, ...patch, updated_at: updatedAt };
    await requestResult(store.put(next));
    return next;
  });
}

export function markOutboxSynced(id) {
  return patchOutbox(id, { status: "synced", last_error: null });
}

export async function markOutboxFailed(id, error) {
  const pending = await listPendingOutbox({ limit: 1000 });
  const row = pending.find((entry) => entry.id === id);
  return patchOutbox(id, {
    status: "failed",
    attempts: Number(row?.attempts || 0) + 1,
    last_error: String(error?.message || error || "Synchronization failed").slice(0, 1000),
  });
}

export async function deleteOutbox(id) {
  if (isNativeRuntime()) {
    const database = await getNativeDatabase();
    await database.run("DELETE FROM outbox WHERE id = ?", [id]);
  } else {
    await indexedStore("outbox", "readwrite", (store) => requestResult(store.delete(id)));
  }
}

export async function migrateLegacyLocalStorage({ snapshots = [], queues = [] } = {}) {
  if (typeof window === "undefined") return;
  for (const entry of snapshots) {
    const raw = window.localStorage.getItem(entry.localStorageKey);
    const data = safeJsonParse(raw, null);
    if (data !== null) {
      await setLocalSnapshot(entry.namespace, data, { storeId: entry.storeId, userId: entry.userId });
    }
  }
  for (const entry of queues) {
    const rows = safeJsonParse(window.localStorage.getItem(entry.localStorageKey), []);
    for (const row of Array.isArray(rows) ? rows : []) {
      await enqueueOutbox({
        operation: entry.operation,
        entityType: entry.entityType,
        payload: row,
        storeId: row?.branch_id || row?.store_id || entry.storeId,
        userId: row?.cashier_id || row?.user_id || entry.userId,
        idempotencyKey: row?.idempotency_key || row?.offline_id || row?.id || uuid(),
      });
    }
  }
}
