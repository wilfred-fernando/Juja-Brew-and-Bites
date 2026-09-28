import assert from 'node:assert/strict';
import { bookingEvent, calendarConfig, upsertCalendarEvent } from '../lib/bookings/googleCalendar.mjs';

const booking = { id: 'booking-1', customer_name: 'Calendar Test', guest_count: 12,
  start_at: '2026-10-01T10:00:00+08:00', end_at: '2026-10-01T13:00:00+08:00', status: 'confirmed' };
const event = bookingEvent(booking, 'Package A', 'project-a');
assert.equal(event.start.dateTime, '2026-10-01T02:00:00.000Z');
assert.equal(event.start.timeZone, 'Asia/Manila');
assert.equal(event.visibility, 'default');
assert.equal(event.attendees, undefined);
assert.match(event.description, /Guests: 12/);
assert.match(event.id, /^[0-9a-f]{64}$/);
assert.notEqual(event.id, bookingEvent(booking, 'Package A', 'project-b').id);
const changed = bookingEvent({ ...booking, guest_count: 20 }, 'Package B', 'project-a');
assert.equal(changed.id, event.id);
const cancelled = bookingEvent({ ...booking, status: 'cancelled' }, 'Package A', 'project-a');
assert.equal(cancelled.id, event.id);
assert.equal(cancelled.transparency, 'transparent');
assert.match(cancelled.summary, /^CANCELLED/);
assert.throws(() => bookingEvent({ ...booking, end_at: booking.start_at }, 'A', 'p'), /invalid/);
assert.throws(() => calendarConfig({}), /not configured/);
const config = { calendarId: 'calendar@example.com' };
async function scenario(statuses, methods) {
  const calls = [];
  await upsertCalendarEvent(config, 'fake-token', event, async (url, options) => {
    calls.push(options.method);
    assert.ok(url.includes('sendUpdates=none'));
    return new Response(null, { status: statuses.shift() });
  });
  assert.deepEqual(calls, methods);
}
await scenario([200], ['PATCH']);
await scenario([404, 200], ['PATCH', 'POST']);
await scenario([404, 409, 200], ['PATCH', 'POST', 'PATCH']);
await assert.rejects(upsertCalendarEvent(config, 'fake', event, async () => new Response(null, { status: 503 })), /503/);
await assert.rejects(upsertCalendarEvent(config, 'fake', event, async () => { throw new Error('timeout'); }), /timeout/);
console.log('PASS: calendar payload, timezone, cancellation, stable IDs, retries and Google failures.');
