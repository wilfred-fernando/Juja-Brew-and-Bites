import { createClient } from '@supabase/supabase-js';
import { sendBookingCancellationEmail } from '@/lib/bookings/cancellationEmail';
export const runtime = 'nodejs';
export async function POST(req) {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i,'').trim();
    if (!token) return Response.json({ error: 'Customer login required.' }, { status: 401 });
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth?.user) return Response.json({ error: 'Customer login required.' }, { status: 401 });
    const { bookingId } = await req.json();
    if (typeof bookingId !== 'string' || !/^[0-9a-f-]{36}$/i.test(bookingId)) return Response.json({ error: 'Valid booking required.' }, { status: 400 });
    const { data: current, error: readError } = await admin.from('function_room_bookings').select('*').eq('id',bookingId).eq('user_id',auth.user.id).maybeSingle();
    if (readError) throw readError;
    if (!current) return Response.json({ error: 'Booking not found.' }, { status: 404 });
    let booking = current;
    if (current.status !== 'cancelled') {
      if (current.status !== 'pending' || new Date(current.start_at) <= new Date()) return Response.json({ error: 'Only upcoming pending bookings can be cancelled here. Confirmed bookings require a cancellation request.' }, { status: 409 });
      const { data, error } = await admin.from('function_room_bookings').update({ status: 'cancelled' }).eq('id',bookingId).eq('user_id',auth.user.id).eq('status','pending').select('*').maybeSingle();
      if (error) throw error;
      if (!data) return Response.json({ error: 'Booking status changed. Refresh and try again.' }, { status: 409 });
      booking = data;
    }
    return Response.json({ success: true, booking, ...await sendBookingCancellationEmail(admin, booking.id) });
  } catch { return Response.json({ error: 'Unable to cancel booking. Refresh and verify its status before retrying.' }, { status: 500 }); }
}
