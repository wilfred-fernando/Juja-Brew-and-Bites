export const JUJA_STAMP_START = "2026-11-15T00:00:00+08:00";
// Exclusive upper bound includes all of January 15 in Manila.
export const JUJA_STAMP_END = "2027-01-16T00:00:00+08:00";
export const JUJA_STAMP_PERIOD = "November 15, 2026 to January 15, 2027";

export function jujaStampPhase(now = Date.now()) {
  const time = Number(new Date(now));
  if (time < Number(new Date(JUJA_STAMP_START))) return "upcoming";
  if (time >= Number(new Date(JUJA_STAMP_END))) return "ended";
  return "active";
}
