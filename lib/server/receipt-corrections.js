import { createClient } from "@supabase/supabase-js";
import { applyReceiptCorrections } from "@/lib/reports/receiptCorrections";

export async function overlayArchivedReceiptCorrections(data, client = null) {
  const admin = client || createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const ids = [...(data.orders || []), ...(data.webOrders || [])].map((row) => row.id);
  const shiftIds = (data.shiftRecords || []).map((row) => String(row.id));
  const corrections = [];
  const shifts = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data: rows, error } = await admin.from("admin_receipt_corrections").select("*").in("source_id", ids.slice(i, i + 200));
    if (error) {
      if (["42P01", "PGRST205"].includes(error.code)) return data;
      throw error;
    }
    corrections.push(...(rows || []));
  }
  for (let i = 0; i < shiftIds.length; i += 200) {
    const { data: rows, error } = await admin.from("admin_receipt_shift_corrections").select("*").in("shift_id", shiftIds.slice(i, i + 200));
    if (error) {
      if (["42P01", "PGRST205"].includes(error.code)) return data;
      throw error;
    }
    shifts.push(...(rows || []));
  }
  // A later refund or cash-count correction in the live database takes
  // precedence over the stored archive snapshot and an earlier receipt edit.
  let effective = { ...data };
  for (const [source, table, field] of [["order", "orders", "orders"], ["web_order", "web_orders", "webOrders"]]) {
    const sourceIds = corrections.filter((row) => row.source_type === source).map((row) => row.source_id);
    for (let index = 0; index < sourceIds.length; index += 200) {
      const chunk = sourceIds.slice(index, index + 200);
      const { data: live, error } = await admin.from(table).select("*").in("id", chunk);
      if (error) throw error;
      const liveMap = new Map((live || []).map((row) => [String(row.id), row]));
      effective[field] = (effective[field] || []).map((row) => liveMap.get(String(row.id)) || row);
      if (source === "order" && live?.length) {
        const { data: liveItems, error: itemError } = await admin.from("order_items").select("*").in("order_id", live.map((row) => row.id));
        if (itemError) throw itemError;
        effective.orderItems = [...(effective.orderItems || []).filter((row) => !liveMap.has(String(row.order_id))), ...(liveItems || [])];
      }
    }
  }
  const liveShiftIds = new Set();
  for (let index = 0; index < shifts.length; index += 200) {
    const { data: live, error } = await admin.from("cashier_pos").select("*").in("id", shifts.slice(index, index + 200).map((row) => row.shift_id));
    if (error) throw error;
    const liveMap = new Map((live || []).map((row) => [String(row.id), row]));
    effective.shiftRecords = (effective.shiftRecords || []).map((row) => liveMap.get(String(row.id)) || row);
    for (const row of live || []) liveShiftIds.add(String(row.id));
  }
  return applyReceiptCorrections(effective, corrections, shifts.filter((row) => !liveShiftIds.has(String(row.shift_id))));
}

export async function loadReceiptArchive(source, id, date, admin) {
  const { data: saved, error } = await admin.from("admin_receipt_corrections").select("*").eq("source_type", source).eq("source_id", id).maybeSingle();
  if (error) throw error;
  const savedArchive = saved ? { receipt: saved.receipt, items: saved.items, linkedWebReceipt: saved.linked_web_receipt } : {};
  const base = String(process.env.D1_ARCHIVE_API_URL || "").replace(/\/$/, "");
  const token = process.env.D1_ARCHIVE_API_TOKEN;
  if (!base || !token || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return savedArchive;
  const origin = new Date(`${date}T12:00:00Z`);
  const day = (offset) => new Date(origin.getTime() + offset * 86400000).toISOString().slice(0, 10);
  const params = new URLSearchParams({ from: day(-1), to: day(1), includeItems: "1" });
  const response = await fetch(`${base}/v1/sales?${params}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load the archived receipt.");
  const data = await overlayArchivedReceiptCorrections(await response.json(), admin);
  const receipt = (source === "order" ? data.orders : data.webOrders)?.find((row) => String(row.id) === id);
  if (!receipt) return savedArchive;
  if (source === "web_order" && data.orders?.some((row) => String(row.source_web_order_id) === id)) throw new Error("Edit the linked POS receipt instead of its web-order copy.");
  return { receipt, items: (data.orderItems || []).filter((row) => String(row.order_id) === id),
    linkedWebReceipt: (data.webOrders || []).find((row) => String(row.id) === String(receipt.source_web_order_id)) || null,
    shifts: data.shiftRecords || [] };
}

export async function loadCorrectionShifts(admin, receipt, archivedShifts = []) {
  const salesAt = receipt.paid_at || receipt.completed_at || receipt.created_at;
  // A business day may close after midnight. Only the enclosing shift is
  // changed by the database, which checks its opening and closing timestamps.
  const end = new Date(Date.parse(salesAt) + 2 * 86400000).toISOString();
  const { data: live, error } = await admin.from("cashier_pos").select("*").eq("store_id", String(receipt.store_id))
    .in("mode", ["close", "end_day"]).gte("created_at", salesAt).lte("created_at", end);
  if (error) throw error;
  const shifts = new Map(archivedShifts.map((row) => [String(row.id), row]));
  for (const row of live || []) shifts.set(String(row.id), row);
  // Purged shifts still have their verified archive queue and correction copy.
  const { data: batches, error: batchError } = await admin.from("sales_archive_batches").select("shift_id")
    .eq("store_id", String(receipt.store_id)).lte("opened_at", salesAt).gte("closed_at", salesAt);
  if (batchError) throw batchError;
  const missing = (batches || []).map((row) => row.shift_id).filter((key) => !shifts.has(key));
  if (missing.length) {
    const base = String(process.env.D1_ARCHIVE_API_URL || "").replace(/\/$/, "");
    const token = process.env.D1_ARCHIVE_API_TOKEN;
    if (!base || !token) throw new Error("The archived shift must be available before this receipt can be corrected.");
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(salesAt));
    const day = new Date(`${date}T12:00:00Z`);
    const params = new URLSearchParams({ from: new Date(day.getTime() - 86400000).toISOString().slice(0, 10), to: date, storeId: String(receipt.store_id) });
    const response = await fetch(`${base}/v1/sales?${params}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load the receipt's archived shift.");
    const payload = await response.json();
    for (const row of payload.shiftRecords || []) shifts.set(String(row.id), row);
    if (missing.some((key) => !shifts.has(key))) throw new Error("The receipt's archived shift is missing. Correction was not saved.");
  }
  return [...shifts.values()];
}
