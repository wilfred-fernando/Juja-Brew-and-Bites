export function bookingDisplayLabel(label, bookings = [], metadata = {}) {
  const value = String(label || '');
  if (!/^VIP Booking(?:\s|$)/i.test(value)) return value;
  const id = metadata.booking_id || value.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i)?.[0];
  const name = metadata.reservation_booking_name || bookings.find(row => row.id === id)?.customer_name;
  if (name) return `VIP Booking · ${name}`;
  return id ? 'VIP Booking · Customer name unavailable' : value;
}
