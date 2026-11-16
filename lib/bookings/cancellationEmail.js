import { escapeEmailHtml as e, getEmailConfigStatus, sendNotificationEmail } from '@/lib/email/notifications';
import { formatDateTime } from '@/lib/dateFormat';
import { isDecemberBooking } from '@/lib/bookings/decemberPolicy.mjs';

export function bookingCancellationHtml(booking, batch) {
  let policy = 'No gift certificate is issued with this cancellation notice.';
  if (isDecemberBooking(booking) || booking.cancellation_gc_choice === 'forfeit') {
    policy = 'Any reservation fee paid is forfeited and will not be converted to a gift certificate (GC).';
  } else if (batch?.status === 'approved') {
    policy = 'Your gift certificate has been approved and is handled separately from this cancellation notice.';
  } else if (batch?.status === 'pending_approval') {
    policy = 'Your reservation fee is queued for gift certificate (GC) conversion, subject to separate approval. Any approved GC will be sent separately.';
  }
  return `<h2>Booking Cancellation</h2><p>Hello ${e(booking.customer_name)},</p>
    <p>Your function-room booking has been cancelled.</p>
    <p><b>Booking:</b> ${e(booking.reference_code || booking.id)}<br />
    <b>Event:</b> ${e(booking.event_type)}<br />
    <b>Schedule:</b> ${e(formatDateTime(booking.start_at))} – ${e(formatDateTime(booking.end_at))} (Philippine time)<br />
    <b>Package:</b> ${e(booking.package_id)}</p><p>${e(policy)}</p>
    <p>Please contact JUJA Brew &amp; Bites if you need assistance.</p>`;
}

export async function sendBookingCancellationEmail(admin, bookingId) {
  let attempted = false;
  try {
    const { data: claim, error: claimError } = await admin.from('booking_cancellation_emails')
      .update({ status: 'sending', claimed_at: new Date().toISOString(), error: null })
      .eq('booking_id', bookingId).in('status', ['pending','failed']).select('booking_snapshot').maybeSingle();
    if (claimError) throw claimError;
    if (!claim) {
      const { data: existing } = await admin.from('booking_cancellation_emails').select('status').eq('booking_id', bookingId).maybeSingle();
      return { emailSent: existing?.status === 'sent', emailError: existing?.status === 'sending' ? 'Cancellation email is sending or awaiting delivery verification; do not resend.' : existing?.status === 'sent' ? '' : 'Cancellation email was not queued.' };
    }
    const booking = claim.booking_snapshot;
    const fail = async message => {
      await admin.from('booking_cancellation_emails').update({ status: 'failed', error: message }).eq('booking_id', bookingId).eq('status', 'sending');
      return { emailSent: false, emailError: message };
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(booking.email || '').trim())) return await fail('A valid customer email address is required.');
    if (!getEmailConfigStatus().ready) return await fail('Email notification is not configured.');
    const { data: batch, error: batchError } = await admin.from('booking_gc_batches').select('status').eq('booking_id', bookingId).maybeSingle();
    if (batchError) return await fail('Unable to verify the cancellation GC status.');
    const html = bookingCancellationHtml(booking, batch);
    attempted = true;
    const sent = await sendNotificationEmail({ to: booking.email.trim(), subject: `Booking Cancellation - ${booking.customer_name || booking.reference_code}`, html });
    if (!sent.sent) { attempted = false; return await fail(sent.publicError || 'Cancellation email was not sent.'); }
    const { error } = await admin.from('booking_cancellation_emails').update({ status: 'sent', sent_at: new Date().toISOString(), error: null }).eq('booking_id', bookingId).eq('status','sending');
    return { emailSent: true, emailError: error ? 'Email sent; delivery record requires verification.' : '' };
  } catch {
    // A thrown SMTP/connection error can happen after delivery. Keep the claim
    // in sending rather than risking duplicate email on an automatic retry.
    return { emailSent: false, emailError: attempted ? 'Cancellation saved. Email delivery is uncertain; verify delivery before retrying.' : 'Cancellation saved, but its email could not be prepared.' };
  }
}
