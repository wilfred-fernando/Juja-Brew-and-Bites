const MANILA_TZ = "Asia/Manila";

export function shiftReportDay(summary = {}, fallback) {
  const explicit = summary.businessDate || summary.business_date;
  const value = /^\d{4}-\d{2}-\d{2}$/.test(explicit || '')
    ? `${explicit}T00:00:00+08:00`
    : summary.shiftStartedAt || fallback;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TZ, weekday: 'short', year: 'numeric', month: 'short', day: '2-digit',
  }).format(date);
}

export function manilaDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function shiftMode(record) {
  return String(record?.mode || record?.shift_type || record?.type || record?.action || "").toLowerCase();
}

export function shiftBusinessDate(value, storeId, shiftRecords = []) {
  if (!value) return manilaDate();
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return manilaDate();

  const scoped = (shiftRecords || [])
    .filter((record) => !storeId || String(record.store_id || record.branch_id || "") === String(storeId))
    .filter((record) => Number.isFinite(new Date(record.created_at).getTime()))
    .filter((record) => new Date(record.created_at).getTime() <= time)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const latest = scoped[0];
  if (latest && shiftMode(latest).includes("open")) {
    const explicitDate = latest.sales_summary?.businessDate || latest.sales_summary?.business_date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(explicitDate || "")) return explicitDate;
    return manilaDate(latest.created_at);
  }
  return manilaDate(value);
}
