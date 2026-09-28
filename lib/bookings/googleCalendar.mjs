import { createHash, createSign } from 'node:crypto';

export function calendarConfig(env = process.env) {
  const calendarId = env.GOOGLE_BOOKINGS_CALENDAR_ID;
  const email = env.GOOGLE_BOOKINGS_SERVICE_ACCOUNT_EMAIL;
  const key = env.GOOGLE_BOOKINGS_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!calendarId || !email || !key) throw new Error('Google bookings calendar is not configured.');
  return { calendarId, email, key };
}

export function bookingEvent(booking, packageName, namespace) {
  const start = new Date(booking.start_at);
  const end = new Date(booking.end_at);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new Error('Booking has invalid calendar dates.');
  }
  const cancelled = booking.status === 'cancelled';
  return {
    id: createHash('sha256').update(`${namespace}:booking:${booking.id}`).digest('hex'),
    summary: `${cancelled ? 'CANCELLED — ' : ''}${booking.customer_name} — ${packageName}`,
    description: `Customer: ${booking.customer_name}\nPackage: ${packageName}\nGuests: ${booking.guest_count}\nStatus: ${cancelled ? 'Cancelled' : 'Confirmed'}\nTimes shown in Philippine time (Asia/Manila).`,
    start: { dateTime: start.toISOString(), timeZone: 'Asia/Manila' },
    end: { dateTime: end.toISOString(), timeZone: 'Asia/Manila' },
    transparency: cancelled ? 'transparent' : 'opaque',
    visibility: 'default',
    reminders: { useDefault: false },
    extendedProperties: { private: { jujaBookingId: String(booking.id) } },
  };
}

export async function accessToken(config, fetcher = fetch) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: config.email, scope: 'https://www.googleapis.com/auth/calendar.events',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(config.key, 'base64url');
  const response = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST', body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}`,
    }), signal: AbortSignal.timeout(10000), cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Google authentication failed (${response.status}).`);
  const data = await response.json();
  if (!data.access_token) throw new Error('Google did not return an access token.');
  return data.access_token;
}

export async function upsertCalendarEvent(config, token, event, fetcher = fetch) {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`;
  const { id, ...body } = event;
  const send = (url, method, payload) => fetcher(`${url}?sendUpdates=none`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(10000), cache: 'no-store',
  });
  let response = await send(`${base}/${id}`, 'PATCH', body);
  if (response.status === 404) {
    response = await send(base, 'POST', event);
    // A timed-out insertion or concurrent retry must reuse the same event.
    if (response.status === 409) response = await send(`${base}/${id}`, 'PATCH', body);
  }
  if (!response.ok) throw new Error(`Google Calendar sync failed (${response.status}).`);
}

export async function syncBookingCalendar(admin, { env = process.env, fetcher = fetch, budgetMs = 20000 } = {}) {
  const config = calendarConfig(env);
  const started = Date.now();
  const token = await accessToken(config, fetcher);
  const results = { synced: 0, failed: 0 };
  for (let i = 0; i < 20 && Date.now() - started < budgetMs; i++) {
    const { data, error } = await admin.rpc('claim_booking_google_calendar');
    if (error) throw new Error('Unable to claim the calendar sync queue.');
    const job = data?.[0];
    if (!job) break;
    let failure = null;
    try {
      const { data: pkg, error: packageError } = await admin.from('function_room_packages')
        .select('name').eq('id', job.payload.package_id).maybeSingle();
      if (packageError) throw new Error('Unable to load the booking package.');
      const event = bookingEvent(job.payload, pkg?.name || `Package ${job.payload.package_id}`, env.NEXT_PUBLIC_SUPABASE_URL);
      await upsertCalendarEvent(config, token, event, fetcher);
      results.synced++;
    } catch (error) {
      failure = error.message;
      results.failed++;
    }
    const { error: finishError } = await admin.rpc('finish_booking_google_calendar', {
      p_booking_id: job.booking_id, p_token: job.lease_token, p_revision: job.revision, p_error: failure,
    });
    if (finishError) throw new Error('Unable to acknowledge the calendar sync queue.');
  }
  return results;
}
