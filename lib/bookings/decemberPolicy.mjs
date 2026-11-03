export const DECEMBER_BOOKING_POLICY = "Rescheduling is allowed only at least 3 days (72 hours) before the booking start time. If you cancel a December booking, the reservation fee is forfeited and will not be converted to a gift certificate (GC).";

export function isDecemberBooking(value) {
  const date = value?.business_date || value?.start_at || value;
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date.slice(5, 7) === "12";
  const timestamp = new Date(date).getTime();
  return Number.isFinite(timestamp) && new Date(timestamp + 8 * 3600000).getUTCMonth() === 11;
}

export function rescheduleMinimumDays(booking, targetDate) {
  return isDecemberBooking(booking) || (targetDate && isDecemberBooking(targetDate)) ? 3 : 2;
}

export function canRescheduleBooking(booking, targetDate, now = new Date()) {
  return new Date(booking.start_at).getTime() - new Date(now).getTime() >= rescheduleMinimumDays(booking, targetDate) * 86400000;
}
