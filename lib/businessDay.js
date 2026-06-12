const MANILA_TZ = "Asia/Manila";

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
  if (latest && shiftMode(latest).includes("open")) return manilaDate(latest.created_at);
  return manilaDate(value);
}
