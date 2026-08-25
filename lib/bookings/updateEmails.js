import { packageConfirmationDetails } from "@/lib/bookings/packageConfirmation";
import { formatDate, formatDateTime } from "@/lib/dateFormat";
import { escapeEmailHtml } from "@/lib/email/notifications";

function peso(value) {
  return `PHP ${Number(value || 0).toLocaleString("en-PH")}`;
}

function scheduleLabel(booking = {}) {
  if (!booking.start_at && !booking.end_at) return "-";
  return `${formatDateTime(booking.start_at)} - ${formatDateTime(booking.end_at)}`;
}

function packageLabel(booking = {}) {
  return booking.package_name || `Package ${booking.package_id || "-"}`;
}

function changedRows(previous = {}, requested = {}) {
  const rows = [
    ["Date", formatDate(previous.business_date, "-"), formatDate(requested.business_date, "-")],
    ["Time", scheduleLabel(previous), scheduleLabel(requested)],
    ["Package", packageLabel(previous), packageLabel(requested)],
    ["Customer name", previous.customer_name || "-", requested.customer_name || "-"],
    ["Guests", previous.guest_count || "-", requested.guest_count || "-"],
    ["Event", previous.event_type || "-", requested.event_type || "-"],
    ["Contact", previous.contact_number || "-", requested.contact_number || "-"],
    ["Email", previous.email || "-", requested.email || "-"],
  ];

  return rows.filter(([, oldValue, newValue]) => String(oldValue) !== String(newValue));
}

export function bookingUpdateRequestAdminHtml({
  bookingId,
  referenceCode,
  customerName,
  requestType,
  requestedAt,
  previousBooking,
  requestedBooking,
  paymentMethod,
  paymentStatus,
  depositAmount,
}) {
  const rows = changedRows(previousBooking, requestedBooking);
  const changeTable = rows.length
    ? rows
        .map(
          ([label, oldValue, newValue]) => `
            <tr>
              <td style="padding:8px;border-bottom:1px solid #e5e7eb"><b>${escapeEmailHtml(label)}</b></td>
              <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeEmailHtml(oldValue)}</td>
              <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#166534"><b>${escapeEmailHtml(newValue)}</b></td>
            </tr>`
        )
        .join("")
    : `<tr><td colspan="3" style="padding:12px;color:#6b7280">Booking information was resubmitted without a detected field change.</td></tr>`;

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937;max-width:720px;margin:auto">
      <h2 style="color:#166534">Booking update request</h2>
      <p><b>${escapeEmailHtml(customerName || "A customer")}</b> requested changes to an existing function-room booking.</p>

      <table style="border-collapse:collapse;width:100%;margin:18px 0">
        <tbody>
          <tr><td style="padding:5px 12px 5px 0"><b>Reference</b></td><td>${escapeEmailHtml(referenceCode || bookingId || "-")}</td></tr>
          <tr><td style="padding:5px 12px 5px 0"><b>Customer</b></td><td>${escapeEmailHtml(customerName || "-")}</td></tr>
          <tr><td style="padding:5px 12px 5px 0"><b>Request type</b></td><td>${escapeEmailHtml(requestType === "reschedule" ? "Reschedule" : "Booking details update")}</td></tr>
          <tr><td style="padding:5px 12px 5px 0"><b>Submitted</b></td><td>${escapeEmailHtml(formatDateTime(requestedAt, "-"))}</td></tr>
        </tbody>
      </table>

      <h3>Requested changes</h3>
      <table style="border-collapse:collapse;width:100%;border:1px solid #e5e7eb">
        <thead>
          <tr style="background:#f3f4f6;text-align:left">
            <th style="padding:8px">Detail</th>
            <th style="padding:8px">Current booking</th>
            <th style="padding:8px">Requested update</th>
          </tr>
        </thead>
        <tbody>${changeTable}</tbody>
      </table>

      <p style="margin-top:18px"><b>Payment method:</b> ${escapeEmailHtml(paymentMethod || "-")}<br>
        <b>Payment status:</b> ${escapeEmailHtml(String(paymentStatus || "-").replaceAll("_", " "))}<br>
        <b>Reservation fee:</b> ${escapeEmailHtml(peso(depositAmount))}</p>

      <div style="margin:20px 0;padding:14px 16px;border-radius:8px;background:#f0fdf4;border:1px solid #86efac;color:#166534">
        The booking is waiting for admin review. Open Admin Bookings to approve the request or adjust the final details.
      </div>

      <p>JUJA Brew &amp; Bites<br>Function Room Booking System</p>
    </div>
  `;
}

export function bookingUpdatedCustomerHtml(booking, packageRow, { reviewResult, adminNote } = {}) {
  const details = packageConfirmationDetails(booking.package_id);
  const packageName = packageRow?.name || `Package ${booking.package_id}`;
  const rentalFee = packageRow?.rental_fee ?? 0;
  const capacity = packageRow?.capacity ?? details.capacity;
  const inclusions = details.inclusions
    .map((item) => `<li style="margin-bottom:6px">${escapeEmailHtml(item)}</li>`)
    .join("");
  const advanceOrderNote = Number(details.consumableAmount || 0) > 0
    ? `<div style="margin:20px 0;padding:14px 16px;border-radius:8px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412">
        <b>Advance order required:</b> Please send us your food and drink order at least one day before your booking date so we can prepare it in advance.
      </div>`
    : "";
  const note = String(adminNote || "").trim();

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937;max-width:680px;margin:auto">
      <h2 style="color:#166534">Your booking has been updated</h2>
      <p>Hi ${escapeEmailHtml(booking.customer_name || "Customer")},</p>
      <p>Your requested booking changes have been reviewed. Your function-room booking is now updated and confirmed with the final details below.</p>

      <p><b>Review result:</b> ${escapeEmailHtml(reviewResult || "Approved as requested")}</p>
      ${note ? `<div style="margin:16px 0;padding:14px 16px;border-radius:8px;background:#f3f4f6;border:1px solid #d1d5db"><b>Note from JUJA:</b><br>${escapeEmailHtml(note)}</div>` : ""}

      <h3 style="margin-top:24px">Updated booking details</h3>
      <table style="border-collapse:collapse;width:100%">
        <tbody>
          <tr><td style="padding:6px 12px 6px 0"><b>Reference</b></td><td>${escapeEmailHtml(booking.reference_code || booking.id)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0"><b>Status</b></td><td>Confirmed</td></tr>
          <tr><td style="padding:6px 12px 6px 0"><b>Event</b></td><td>${escapeEmailHtml(booking.event_type || "-")}</td></tr>
          <tr><td style="padding:6px 12px 6px 0"><b>Date</b></td><td>${escapeEmailHtml(formatDate(booking.business_date, "-"))}</td></tr>
          <tr><td style="padding:6px 12px 6px 0"><b>Time</b></td><td>${escapeEmailHtml(scheduleLabel(booking))}</td></tr>
          <tr><td style="padding:6px 12px 6px 0"><b>Package</b></td><td>${escapeEmailHtml(packageName)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0"><b>Guests</b></td><td>${escapeEmailHtml(booking.guest_count || "-")}</td></tr>
          ${Number(booking.extension_hours || 0) > 0 ? `<tr><td style="padding:6px 12px 6px 0"><b>Extension</b></td><td>${escapeEmailHtml(booking.extension_hours)} hour(s)</td></tr>` : ""}
          <tr><td style="padding:6px 12px 6px 0"><b>Reservation fee</b></td><td>${escapeEmailHtml(peso(booking.deposit_amount))}</td></tr>
          <tr><td style="padding:6px 12px 6px 0"><b>Payment status</b></td><td>Approved</td></tr>
        </tbody>
      </table>

      <h3 style="margin-top:24px">Selected package</h3>
      <p><b>${escapeEmailHtml(packageName)}</b><br>
        Rental fee: ${escapeEmailHtml(peso(rentalFee))}<br>
        Capacity: up to ${escapeEmailHtml(capacity || booking.guest_count || "-")} guests
        ${Number(details.consumableAmount || 0) > 0 ? `<br>Consumable food and drink credit: ${escapeEmailHtml(peso(details.consumableAmount))}` : ""}
      </p>
      ${inclusions ? `<p><b>Package inclusions:</b></p><ul>${inclusions}</ul>` : ""}
      ${advanceOrderNote}

      <p><b>Please use these updated details instead of the information in your previous confirmation.</b></p>
      <p>If you have questions about the updated booking, contact us at 0939-9228383 or at www.facebook.com/jujabrewandbites.</p>
      <p>Thank you,<br><b>JUJA Brew &amp; Bites</b></p>
    </div>
  `;
}
