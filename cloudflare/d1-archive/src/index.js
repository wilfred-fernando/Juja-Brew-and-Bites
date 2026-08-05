const TABLE_COLUMNS = {
  archive_orders: [
    "source_id", "source_type", "business_date", "created_at", "paid_at", "store_id",
    "branch_id", "receipt_number", "order_number", "status", "payment_method", "customer_id",
    "loyalty_member_id", "gross_amount", "discount_amount", "refund_amount", "net_amount", "payload_json",
  ],
  archive_order_items: [
    "source_id", "order_id", "business_date", "store_id", "menu_item_id", "item_name",
    "category_name", "quantity", "gross_amount", "discount_amount", "refund_amount", "net_amount", "payload_json",
  ],
  archive_shifts: ["source_id", "business_date", "store_id", "cashier_id", "mode", "created_at", "cash_total", "payload_json"],
  archive_inventory_daily: ["source_id", "inventory_date", "store_id", "inventory_item_id", "ending_quantity", "payload_json"],
  archive_inventory_transactions: [
    "source_id", "business_date", "store_id", "inventory_item_id", "transaction_type",
    "quantity_effect", "created_at", "payload_json",
  ],
  archive_audit_logs: ["source_id", "business_date", "store_id", "actor_user_id", "entity", "action", "created_at", "payload_json"],
  archive_notifications: ["source_id", "business_date", "store_id", "target_user_id", "type", "created_at", "read_at", "payload_json"],
  sales_daily_summary: [
    "business_date", "store_id", "gross_amount", "discount_amount", "refund_amount",
    "net_amount", "order_count", "updated_at",
  ],
  sales_payment_daily: [
    "business_date", "store_id", "payment_method", "amount", "transaction_count", "updated_at",
  ],
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function authorized(request, env) {
  const expected = env.ARCHIVE_API_TOKEN;
  return Boolean(expected) && request.headers.get("authorization") === `Bearer ${expected}`;
}

function safeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : null;
}

async function upsertBatch(request, env) {
  const body = await request.json();
  const columns = TABLE_COLUMNS[body.table];
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!columns) return json({ error: "Archive table is not allowed." }, 400);
  if (!rows.length) return json({ ok: true, count: 0 });
  if (rows.length > 500) return json({ error: "Maximum batch size is 500 rows." }, 400);

  const placeholders = columns.map(() => "?").join(",");
  const conflictColumns = body.table === "sales_daily_summary"
    ? ["business_date", "store_id"]
    : body.table === "sales_payment_daily"
      ? ["business_date", "store_id", "payment_method"]
      : ["source_id"];
  const updates = columns
    .filter((column) => !conflictColumns.includes(column))
    .map((column) => `${column}=excluded.${column}`)
    .join(",");
  const sql = `INSERT INTO ${body.table} (${columns.join(",")}) VALUES (${placeholders})
    ON CONFLICT (${conflictColumns.join(",")}) DO UPDATE SET ${updates}`;
  const statements = rows.map((row) => env.ARCHIVE_DB.prepare(sql).bind(...columns.map((column) => row[column] ?? null)));
  await env.ARCHIVE_DB.batch(statements);
  if (body.shiftId && Array.isArray(body.hashes) && body.hashes.length === rows.length) {
    const hashSql = `INSERT INTO archive_shift_batch_records (shift_id, table_name, source_id, row_hash)
      VALUES (?, ?, ?, ?) ON CONFLICT (shift_id, table_name, source_id)
      DO UPDATE SET row_hash=excluded.row_hash`;
    await env.ARCHIVE_DB.batch(rows.map((row, index) => env.ARCHIVE_DB
      .prepare(hashSql)
      .bind(String(body.shiftId), body.manifestTable || body.table, String(row.source_id), String(body.hashes[index]))));
  }
  return json({ ok: true, count: rows.length });
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function startShiftBatch(request, env) {
  const body = await request.json();
  if (!body.shiftId || !body.openedAt || !body.closedAt || !body.businessDate || !body.expectedChecksum) {
    return json({ error: "Shift manifest is incomplete." }, 400);
  }
  await env.ARCHIVE_DB.prepare(`INSERT INTO archive_shift_batches
    (shift_id, store_id, cashier_id, opened_at, closed_at, business_date,
     expected_counts_json, expected_totals_json, expected_checksum, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', CURRENT_TIMESTAMP)
    ON CONFLICT (shift_id) DO UPDATE SET
      store_id=excluded.store_id, cashier_id=excluded.cashier_id,
      opened_at=excluded.opened_at, closed_at=excluded.closed_at,
      business_date=excluded.business_date, expected_counts_json=excluded.expected_counts_json,
      expected_totals_json=excluded.expected_totals_json,
      expected_checksum=excluded.expected_checksum, status='uploading', updated_at=CURRENT_TIMESTAMP`)
    .bind(String(body.shiftId), body.storeId || null, body.cashierId || null, body.openedAt, body.closedAt,
      body.businessDate, JSON.stringify(body.expectedCounts || {}), JSON.stringify(body.expectedTotals || {}), body.expectedChecksum)
    .run();
  return json({ ok: true, shiftId: body.shiftId });
}

async function finalizeShiftBatch(request, env) {
  const body = await request.json();
  const shiftId = String(body.shiftId || "");
  const batch = await env.ARCHIVE_DB.prepare("SELECT * FROM archive_shift_batches WHERE shift_id = ?").bind(shiftId).first();
  if (!batch) return json({ error: "Shift batch was not started." }, 404);
  const records = await env.ARCHIVE_DB.prepare(
    "SELECT table_name, source_id, row_hash FROM archive_shift_batch_records WHERE shift_id = ? ORDER BY table_name, source_id"
  ).bind(shiftId).all();
  const counts = {};
  for (const row of records.results) counts[row.table_name] = (counts[row.table_name] || 0) + 1;
  const checksumInput = records.results.map((row) => `${row.table_name}:${row.source_id}:${row.row_hash}`).join("\n");
  const checksum = await sha256(checksumInput);
  const expectedCounts = JSON.parse(batch.expected_counts_json || "{}");
  for (const tableName of Object.keys(expectedCounts)) {
    if (!(tableName in counts)) counts[tableName] = 0;
  }
  const expectedTotals = JSON.parse(batch.expected_totals_json || "{}");
  const totalsRow = await env.ARCHIVE_DB.prepare(`SELECT
      ROUND(COALESCE(SUM(o.gross_amount), 0), 2) AS gross,
      ROUND(COALESCE(SUM(o.discount_amount), 0), 2) AS discounts,
      ROUND(COALESCE(SUM(o.refund_amount), 0), 2) AS refunds,
      ROUND(COALESCE(SUM(o.net_amount), 0), 2) AS net
    FROM archive_shift_batch_records r
    JOIN archive_orders o ON o.source_id = r.source_id
    WHERE r.shift_id = ? AND r.table_name IN ('archive_orders', 'archive_web_orders')`)
    .bind(shiftId).first();
  const totals = {
    gross: Number(totalsRow?.gross || 0),
    discounts: Number(totalsRow?.discounts || 0),
    refunds: Number(totalsRow?.refunds || 0),
    net: Number(totalsRow?.net || 0),
  };
  const countsMatch = JSON.stringify(stableValue(counts)) === JSON.stringify(stableValue(expectedCounts));
  const checksumMatch = checksum === batch.expected_checksum;
  const totalsMatch = JSON.stringify(stableValue(totals)) === JSON.stringify(stableValue(expectedTotals));
  const status = countsMatch && checksumMatch && totalsMatch ? "verified" : "mismatch";
  await env.ARCHIVE_DB.prepare(`UPDATE archive_shift_batches SET actual_counts_json=?, actual_totals_json=?,
    actual_checksum=?, status=?, verified_at=CASE WHEN ?='verified' THEN CURRENT_TIMESTAMP ELSE NULL END,
    updated_at=CURRENT_TIMESTAMP WHERE shift_id=?`)
    .bind(JSON.stringify(counts), JSON.stringify(totals), checksum, status, status, shiftId).run();
  return json({ ok: status === "verified", status, shiftId, counts, expectedCounts,
    totals, expectedTotals, checksum, expectedChecksum: batch.expected_checksum,
    countsMatch, totalsMatch, checksumMatch }, status === "verified" ? 200 : 409);
}

async function shiftBatchStatus(url, env) {
  const shiftId = decodeURIComponent(url.pathname.split("/").pop() || "");
  const batch = await env.ARCHIVE_DB.prepare("SELECT * FROM archive_shift_batches WHERE shift_id = ?").bind(shiftId).first();
  return batch ? json(batch) : json({ error: "Shift batch not found." }, 404);
}

async function customerHistory(url, env) {
  const memberId = String(url.searchParams.get("memberId") || "").trim();
  const userId = String(url.searchParams.get("userId") || "").trim();
  const customerCode = String(url.searchParams.get("customerCode") || "").trim();
  if (!memberId && !userId && !customerCode) return json({ rows: [] });
  const result = await env.ARCHIVE_DB.prepare(`SELECT source_id, source_type, payload_json
    FROM archive_orders
    WHERE (? <> '' AND loyalty_member_id = ?)
       OR (? <> '' AND customer_id = ?)
       OR json_extract(payload_json, '$.user_id') = ?
    ORDER BY created_at DESC LIMIT 1000`)
    .bind(memberId, memberId, customerCode, customerCode, userId).all();
  return json({ rows: result.results.map((row) => ({ ...JSON.parse(row.payload_json), _archive_source_type: row.source_type })) });
}

async function salesHistory(url, env) {
  const from = safeDate(url.searchParams.get("from"));
  const to = safeDate(url.searchParams.get("to"));
  if (!from || !to) return json({ error: "from and to must use YYYY-MM-DD." }, 400);
  const includeItems = url.searchParams.get("includeItems") === "1";
  const storeId = url.searchParams.get("storeId");
  const storeClause = storeId ? " AND store_id = ?" : "";
  const bindings = storeId ? [from, to, storeId] : [from, to];

  const archivedOrders = await env.ARCHIVE_DB
    .prepare(`SELECT source_type, payload_json FROM archive_orders WHERE business_date BETWEEN ? AND ?${storeClause} ORDER BY created_at DESC`)
    .bind(...bindings)
    .all();
  const shifts = await env.ARCHIVE_DB
    .prepare(`SELECT payload_json FROM archive_shifts WHERE business_date BETWEEN ? AND ?${storeClause} ORDER BY created_at`)
    .bind(...bindings)
    .all();
  let items = { results: [] };
  if (includeItems) {
    items = await env.ARCHIVE_DB
      .prepare(`SELECT payload_json FROM archive_order_items WHERE business_date BETWEEN ? AND ?${storeClause}`)
      .bind(...bindings)
      .all();
  }
  const meta = await env.ARCHIVE_DB.prepare("SELECT value FROM archive_meta WHERE key = 'archive_through'").first();
  return json({
    archiveThrough: meta?.value || null,
    orders: archivedOrders.results
      .filter((row) => row.source_type !== "WEB")
      .map((row) => JSON.parse(row.payload_json)),
    webOrders: archivedOrders.results
      .filter((row) => row.source_type === "WEB")
      .map((row) => JSON.parse(row.payload_json)),
    orderItems: items.results.map((row) => JSON.parse(row.payload_json)),
    shiftRecords: shifts.results.map((row) => JSON.parse(row.payload_json)),
  });
}

async function validation(url, env) {
  const from = safeDate(url.searchParams.get("from")) || "0000-01-01";
  const to = safeDate(url.searchParams.get("to")) || "9999-12-31";
  const orders = await env.ARCHIVE_DB.prepare(
    `SELECT COUNT(*) count, ROUND(SUM(gross_amount), 2) gross, ROUND(SUM(discount_amount), 2) discounts,
            ROUND(SUM(refund_amount), 2) refunds, ROUND(SUM(net_amount), 2) net
       FROM archive_orders WHERE business_date BETWEEN ? AND ?`
  ).bind(from, to).first();
  const items = await env.ARCHIVE_DB.prepare(
    "SELECT COUNT(*) count, ROUND(SUM(net_amount), 2) net FROM archive_order_items WHERE business_date BETWEEN ? AND ?"
  ).bind(from, to).first();
  const meta = await env.ARCHIVE_DB.prepare("SELECT key, value, updated_at FROM archive_meta ORDER BY key").all();
  return json({ from, to, orders, items, meta: meta.results });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, service: "juja-history-archive" });
    if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
    if (request.method === "POST" && url.pathname === "/v1/archive/batch") return upsertBatch(request, env);
    if (request.method === "POST" && url.pathname === "/v1/archive/shift/start") return startShiftBatch(request, env);
    if (request.method === "POST" && url.pathname === "/v1/archive/shift/finalize") return finalizeShiftBatch(request, env);
    if (request.method === "GET" && url.pathname.startsWith("/v1/archive/shift/")) return shiftBatchStatus(url, env);
    if (request.method === "GET" && url.pathname === "/v1/sales") return salesHistory(url, env);
    if (request.method === "GET" && url.pathname === "/v1/customer-history") return customerHistory(url, env);
    if (request.method === "GET" && url.pathname === "/v1/validate") return validation(url, env);
    if (request.method === "POST" && url.pathname === "/v1/archive/complete") {
      const body = await request.json();
      const through = safeDate(body.archiveThrough);
      if (!through) return json({ error: "archiveThrough must use YYYY-MM-DD." }, 400);
      await env.ARCHIVE_DB.prepare(
        `INSERT INTO archive_meta (key, value, updated_at) VALUES ('archive_through', ?, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`
      ).bind(through).run();
      return json({ ok: true, archiveThrough: through });
    }
    return json({ error: "Not found" }, 404);
  },
};
