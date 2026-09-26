const FINANCE_TABLES = new Set([
  "finance_expenses", "finance_petty_cash_entries", "finance_petty_cash_funds",
  "finance_references", "finance_delete_requests",
  "finance_daily_inventory_entries", "finance_inventory_transfers",
]);

async function sourceRequest(env, query, method = "GET") {
  if (!env.FINANCE_SUPABASE_URL || !env.FINANCE_SUPABASE_SERVICE_KEY) {
    throw new Error("Finance source secrets are not configured.");
  }
  const url = new URL("/rest/v1/finance_cloudflare_outbox", env.FINANCE_SUPABASE_URL);
  url.search = query;
  const response = await fetch(url, {
    method,
    headers: {
      apikey: env.FINANCE_SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${env.FINANCE_SUPABASE_SERVICE_KEY}`,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Finance queue ${method} failed (${response.status}).`);
  return method === "GET" ? response.json() : null;
}

export async function syncFinance(env, maxBatches = 10) {
  let processed = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const events = await sourceRequest(env, "select=*&order=id.asc&limit=100");
    if (!Array.isArray(events)) throw new Error("Invalid finance queue response.");
    if (!events.length) break;
    const statements = [];
    for (const event of events) {
      if (!Number.isSafeInteger(event.id) || !FINANCE_TABLES.has(event.source_table) ||
          !["INSERT", "UPDATE", "DELETE"].includes(event.operation) || !event.source_id || !event.payload) {
        throw new Error("Invalid finance queue event; event retained for investigation.");
      }
      const payload = JSON.stringify(event.payload);
      statements.push(env.ARCHIVE_DB.prepare(`INSERT INTO finance_events
        (event_id, source_table, source_id, operation, payload_json, source_changed_at)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(event_id) DO NOTHING`)
        .bind(event.id, event.source_table, event.source_id, event.operation, payload, event.created_at));
      statements.push(env.ARCHIVE_DB.prepare(`INSERT INTO finance_records
        (source_table, source_id, event_id, is_deleted, payload_json, source_changed_at)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(source_table, source_id) DO UPDATE SET
        event_id=excluded.event_id, is_deleted=excluded.is_deleted,
        payload_json=excluded.payload_json, source_changed_at=excluded.source_changed_at,
        synced_at=CURRENT_TIMESTAMP WHERE excluded.event_id > finance_records.event_id`)
        .bind(event.source_table, event.source_id, event.id, event.operation === "DELETE" ? 1 : 0, payload, event.created_at));
    }
    // D1 commits the batch transaction before acknowledging source events.
    // Retries and overlapping runs are safe, including delayed delete events.
    const results = await env.ARCHIVE_DB.batch(statements);
    if (results.some((result) => result.success === false)) throw new Error("Finance D1 batch failed.");
    await sourceRequest(env, `id=in.(${events.map((event) => event.id).join(",")})`, "DELETE");
    processed += events.length;
  }
  return { processed };
}

export async function financeStatus(env) {
  const result = await env.ARCHIVE_DB.prepare(`SELECT source_table,
    COUNT(*) AS records, SUM(is_deleted) AS deleted,
    MAX(synced_at) AS last_synced_at FROM finance_records GROUP BY source_table`).all();
  return { tables: result.results };
}
