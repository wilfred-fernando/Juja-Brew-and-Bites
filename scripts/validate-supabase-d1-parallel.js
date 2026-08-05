/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

for (const file of [".env.local", ".env.d1-archive"]) {
  const target = path.resolve(file);
  if (!fs.existsSync(target)) continue;
  for (const line of fs.readFileSync(target, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stable(value[key]);
      return result;
    }, {});
  }
  return value;
}

function equal(left, right) {
  return JSON.stringify(stable(left || {})) === JSON.stringify(stable(right || {}));
}

function parseJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusOf(row) {
  return String(row?.voided_at ? "voided" : row?.status || "").toLowerCase();
}

function amountsOf(row) {
  const gross = num(row.gross_amount ?? row.gross_sales ?? row.subtotal ?? row.total);
  const discounts = num(row.discount_amount ?? row.discount ?? row.discounts);
  const explicitRefund = num(row.refund_amount ?? row.refund ?? row.refunds);
  const refunds = explicitRefund || (["refunded", "voided"].includes(statusOf(row))
    ? num(row.net_amount ?? row.total)
    : 0);
  const net = row.net_amount == null
    ? Math.max(0, gross - discounts - refunds)
    : Math.max(0, num(row.net_amount));
  return { gross, discounts, refunds, net };
}

async function fetchByIds(supabase, table, ids) {
  if (!ids.length) return [];
  const rows = [];
  for (let index = 0; index < ids.length; index += 200) {
    const { data, error } = await supabase.from(table).select("*").in("id", ids.slice(index, index + 200));
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
  }
  return rows;
}

async function sourceSnapshot(supabase, batchId) {
  const { data: records, error } = await supabase.from("sales_archive_batch_records")
    .select("source_table,source_id")
    .eq("batch_id", batchId);
  if (error) throw error;
  const grouped = (records || []).reduce((result, row) => {
    (result[row.source_table] ||= []).push(row);
    return result;
  }, {});
  const orderIds = (grouped.archive_orders || []).map((row) => row.source_id);
  const webOrderIds = (grouped.archive_web_orders || []).map((row) => row.source_id);
  const shiftIds = (grouped.archive_shifts || []).map((row) => row.source_id);
  const [orders, webOrders, shifts] = await Promise.all([
    fetchByIds(supabase, "orders", orderIds),
    fetchByIds(supabase, "web_orders", webOrderIds),
    fetchByIds(supabase, "cashier_pos", shiftIds),
  ]);
  let posItems = [];
  if (orderIds.length) {
    for (let index = 0; index < orderIds.length; index += 200) {
      const { data, error: itemError } = await supabase.from("order_items").select("id").in("order_id", orderIds.slice(index, index + 200));
      if (itemError) throw new Error(`order_items: ${itemError.message}`);
      posItems.push(...(data || []));
    }
  }
  const webItemCount = webOrders.reduce((count, row) => {
    if (Array.isArray(row.items)) return count + row.items.length;
    try {
      const parsed = JSON.parse(row.items || "[]");
      return count + (Array.isArray(parsed) ? parsed.length : 0);
    } catch {
      return count;
    }
  }, 0);
  const totals = [...orders, ...webOrders].reduce((sum, row) => {
    const amounts = amountsOf(row);
    for (const key of Object.keys(sum)) sum[key] += amounts[key];
    return sum;
  }, { gross: 0, discounts: 0, refunds: 0, net: 0 });
  for (const key of Object.keys(totals)) totals[key] = Number(totals[key].toFixed(2));
  return {
    counts: {
      archive_orders: orders.length,
      archive_web_orders: webOrders.length,
      archive_order_items: posItems.length + webItemCount,
      archive_shifts: shifts.length,
    },
    totals,
  };
}

async function d1Shift(base, token, shiftId) {
  const response = await fetch(`${base}/v1/archive/shift/${encodeURIComponent(shiftId)}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `D1 returned ${response.status}`);
  return payload;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const d1Base = String(process.env.D1_ARCHIVE_API_URL || "").replace(/\/$/, "");
  const d1Token = process.env.D1_ARCHIVE_API_TOKEN;
  if (!url || !serviceKey || !d1Base || !d1Token) throw new Error("Supabase and D1 archive environment variables are required.");

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: batches, error } = await supabase.from("sales_archive_batches")
    .select("id,shift_id,status,expected_counts,expected_totals,expected_checksum,d1_counts,d1_totals,d1_checksum,verified_at,purge_after")
    .in("status", ["verified", "mismatch"])
    .order("closed_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  const results = [];
  for (const batch of batches || []) {
    try {
      const remote = await d1Shift(d1Base, d1Token, batch.shift_id);
      const remoteCounts = parseJson(remote.actual_counts_json);
      const remoteTotals = parseJson(remote.actual_totals_json);
      const countsMatch = equal(batch.expected_counts, remoteCounts) && equal(batch.d1_counts, remoteCounts);
      const totalsMatch = equal(batch.expected_totals, remoteTotals) && equal(batch.d1_totals, remoteTotals);
      const checksumMatch = batch.expected_checksum === remote.actual_checksum && batch.d1_checksum === remote.actual_checksum;
      const source = await sourceSnapshot(supabase, batch.id);
      const sourceCountsMatch = equal(batch.expected_counts, source.counts);
      const sourceTotalsMatch = equal(batch.expected_totals, source.totals);
      results.push({ shiftId: batch.shift_id, status: batch.status, countsMatch, totalsMatch, checksumMatch,
        sourceCountsMatch, sourceTotalsMatch, purgeAfter: batch.purge_after || "",
        ok: countsMatch && totalsMatch && checksumMatch && sourceCountsMatch && sourceTotalsMatch && remote.status === "verified" });
    } catch (validationError) {
      results.push({ shiftId: batch.shift_id, status: batch.status, ok: false, error: validationError.message });
    }
  }

  console.table(results);
  if (!results.length) {
    console.error("No verified shift archive batches exist. Cleanup must remain disabled.");
    process.exitCode = 2;
    return;
  }
  const failures = results.filter((row) => !row.ok);
  console.log(JSON.stringify({ checked: results.length, passed: results.length - failures.length, failed: failures.length }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
