import { requireAdminApi } from '@/lib/server/admin-api';

export async function POST(request) {
  try {
    const { admin, user, response } = await requireAdminApi();
    if (response) return response;
    const body = await request.json().catch(() => null);
    if (!body || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.bookingId || '') || !['pending','approved'].includes(body.paymentStatus)) {
      return Response.json({ error: 'Select a booking and Pending or Approved payment.' }, { status: 400 });
    }
    const { data, error } = await admin.rpc('admin_set_booking_payment', {
      p_booking_id: body.bookingId, p_choice: body.paymentStatus, p_actor: user.id,
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: error?.message || 'Unable to save booking payment.' }, { status: 500 });
  }
}
