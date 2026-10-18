export const DEFAULT_BOOKING_HOURS = [10, 14, 18, 22];

// Display blocked/default slots too; adjustedBookingHours remains the source
// for the replacement times that can actually be reserved.
export function visibleBookingHours(dateISO, bookings = [], now = new Date()) {
  const midnight = Date.parse(`${dateISO}T00:00:00+08:00`);
  if (!Number.isFinite(midnight)) return [];
  const hours = new Set([...DEFAULT_BOOKING_HOURS, ...adjustedBookingHours(dateISO, bookings, now)]);
  for (const booking of bookings) {
    if (!["pending", "confirmed", "cancellation_requested"].includes(booking.status)) continue;
    if (booking.status === "pending" && booking.payment_status === "waiting_for_payment"
      && !booking.payment_proof_url && booking.created_at
      && now - new Date(booking.created_at) >= 24 * 3600000) continue;
    const hour = (Date.parse(booking.start_at) - midnight) / 3600000;
    if (hour >= 10 && hour < 26) hours.add(hour);
  }
  return [...hours].sort((a, b) => a - b);
}

// Hours are relative to the Manila business date; 26 is 2 AM next day.
export function adjustedBookingHours(dateISO, bookings = [], now = new Date()) {
  const midnight = Date.parse(`${dateISO}T00:00:00+08:00`);
  if (!Number.isFinite(midnight)) return [];
  const intervals = bookings.filter((booking) => {
    if (!["pending", "confirmed", "cancellation_requested"].includes(booking.status)) return false;
    return !(booking.status === "pending" && booking.payment_status === "waiting_for_payment"
      && !booking.payment_proof_url && booking.created_at
      && now - new Date(booking.created_at) >= 24 * 3600000);
  }).map((booking) => ({
    start: (Date.parse(booking.start_at) - midnight) / 3600000,
    end: (Date.parse(booking.end_at) - midnight) / 3600000,
  })).filter(({ start, end }) => Number.isFinite(start) && end > start)
    .sort((a, b) => a.start - b.start);
  const hours = [];
  for (const defaultHour of DEFAULT_BOOKING_HOURS) {
    let hour = Math.max(defaultHour, hours.length ? hours.at(-1) + 4 : 10);
    for (const interval of intervals) {
      if (hour < interval.end + 1 && hour + 3 > interval.start - 1) {
        hour = interval.end + 1;
      }
    }
    if (hour + 3 <= 26) hours.push(hour);
  }
  return hours;
}
