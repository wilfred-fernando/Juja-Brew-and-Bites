import { escapeEmailHtml as e } from '@/lib/email/notifications';
import { formatDateTime } from '@/lib/dateFormat';

export function cashierBookingAdminHtml(booking) {
  return `<h2>Cashier booking awaiting approval</h2>
    <p>Review this booking before confirming it to the customer.</p>
    <p>Booking: ${e(booking.reference_code || booking.id)}</p>
    <p>Customer: ${e(booking.customer_name)}</p>
    <p>Schedule: ${e(formatDateTime(booking.start_at))} – ${e(formatDateTime(booking.end_at))}</p>
    <p>Package: ${e(booking.package_id)}</p>
    <p>Reservation fee: PHP ${e(booking.deposit_amount)} / ${e(booking.payment_method)}</p>
    <p>Created by: ${e(booking.created_by_name || 'Cashier')}</p>
    <p><a href="https://admin.jujabrewandbites.com/admin/bookings">Review booking</a></p>`;
}

export function bookingRejectedHtml(booking) {
  return `<h2>Function Room Booking Not Approved</h2>
    <p>Hello ${e(booking.customer_name)},</p>
    <p>Your booking request ${e(booking.reference_code || booking.id)} for ${e(formatDateTime(booking.start_at))} was not approved and has been cancelled.</p>
    <p>Please contact JUJA Brew &amp; Bites for assistance or an alternative schedule.</p>`;
}
