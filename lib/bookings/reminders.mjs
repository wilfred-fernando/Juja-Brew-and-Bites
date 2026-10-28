const HOUR = 60 * 60 * 1000;
const LEASE_MS = 45000;

export function bookingReminderCandidates(bookings, now = Date.now()) {
  return (bookings || []).flatMap(booking => {
    const start = Date.parse(booking.start_at);
    const remaining = start - now;
    if (!booking.id || booking.status !== 'confirmed' || ['expired', 'cancelled'].includes(booking.payment_status)
      || !Number.isFinite(start) || remaining <= 0 || remaining > 3 * HOUR) return [];
    // A resumed POS shows the latest due reminder instead of replaying all
    // missed thresholds. A reschedule gets a new key; extension-only edits do not.
    const hours = remaining > 2 * HOUR ? 3 : remaining > HOUR ? 2 : 1;
    return [{ ...booking, hours, key: `${booking.id}:${start}:${hours}`, expiresAt: start + 24 * HOUR }];
  }).sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at) || a.id.localeCompare(b.id));
}

function state(storage, scope, now) {
  let entries;
  try { entries = JSON.parse(storage.getItem(scope) || '{}'); } catch { entries = {}; }
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) entries = {};
  return Object.fromEntries(Object.entries(entries).filter(([, entry]) => entry && entry.expiresAt > now));
}

export function claimBookingReminder(storage, scope, reminder, owner, now = Date.now()) {
  const entries = state(storage, scope, now);
  const previous = entries[reminder.key];
  if (previous?.acknowledged || (previous?.owner && previous.owner !== owner && previous.leaseUntil > now)) return false;
  entries[reminder.key] = { expiresAt: reminder.expiresAt, owner, leaseUntil: now + LEASE_MS };
  storage.setItem(scope, JSON.stringify(entries));
  return true;
}

export function acknowledgeBookingReminder(storage, scope, reminder, now = Date.now()) {
  const entries = state(storage, scope, now);
  entries[reminder.key] = { expiresAt: reminder.expiresAt, acknowledged: true };
  storage.setItem(scope, JSON.stringify(entries));
}

export function releaseBookingReminder(storage, scope, key, owner, now = Date.now()) {
  const entries = state(storage, scope, now);
  if (entries[key]?.owner === owner) delete entries[key];
  storage.setItem(scope, JSON.stringify(entries));
}
