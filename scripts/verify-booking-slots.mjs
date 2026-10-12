import assert from 'node:assert/strict';
import { adjustedBookingHours } from '../lib/bookings/slots.mjs';

const day = '2026-12-15';
const booking = (start, end, extra = {}) => ({
  start_at: `${day}T${start}:00+08:00`,
  end_at: `${day}T${end}:00+08:00`,
  status: 'confirmed', ...extra,
});
assert.deepEqual(adjustedBookingHours(day), [10, 14, 18, 22]);
assert.deepEqual(adjustedBookingHours(day, [booking('19:00', '22:00')]), [10, 14, 23]);
assert.deepEqual(adjustedBookingHours(day, [booking('18:00', '21:00')]), [10, 14, 22]);
assert.deepEqual(adjustedBookingHours(day, [booking('11:00', '14:00')]), [15, 19, 23]);
assert.deepEqual(adjustedBookingHours(day, [booking('19:00', '22:30')]), [10, 14]);
assert.deepEqual(adjustedBookingHours(day, [booking('18:30', '21:30')]), [10, 14, 22.5]);
assert.deepEqual(adjustedBookingHours(day, [booking('19:00', '22:00', { status: 'cancelled' })]), [10, 14, 18, 22]);
assert.deepEqual(adjustedBookingHours(day, [booking('19:00', '22:00', {
  status: 'pending', payment_status: 'waiting_for_payment', created_at: '2026-12-01T00:00:00Z',
})], new Date('2026-12-15T00:00:00Z')), [10, 14, 18, 22]);
const multiple = [booking('19:00', '22:00'), booking('11:00', '14:00')];
assert.deepEqual(adjustedBookingHours(day, multiple), [15, 23]);
assert.deepEqual(adjustedBookingHours(day, multiple.reverse()), [15, 23]);
// Next-day reservations must also block the late slot on this business date.
assert.deepEqual(adjustedBookingHours(day, [{ status: 'confirmed',
  start_at: '2026-12-16T00:00:00+08:00', end_at: '2026-12-16T03:00:00+08:00',
}]), [10, 14, 18]);
console.log('Booking slot regression checks passed.');
