import { createClient } from '@supabase/supabase-js';
import { syncBookingCalendar } from '@/lib/bookings/googleCalendar.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await syncBookingCalendar(admin);
    return Response.json(result, { status: result.failed ? 502 : 200 });
  } catch (error) {
    console.error('Booking calendar sync:', error.message);
    return Response.json({ error: 'Calendar sync unavailable. Queued bookings will be retried.' }, { status: 503 });
  }
}
