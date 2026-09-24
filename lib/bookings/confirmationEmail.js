import { packageConfirmationDetails } from "@/lib/bookings/packageConfirmation";
import { formatDate, formatDateTime } from "@/lib/dateFormat";
import { escapeEmailHtml } from "@/lib/email/notifications";

function peso(value) {
  return `PHP ${Number(value || 0).toLocaleString("en-PH")}`;
}

export function confirmationHtml(booking, packageRow) {
  const details = packageConfirmationDetails(booking.package_id);
  const packageName = packageRow?.name || `Package ${booking.package_id}`;
  const rentalFee = packageRow?.rental_fee ?? 0;
  const capacity = packageRow?.capacity ?? details.capacity;
  const timeLabel = `${formatDateTime(booking.start_at)} - ${formatDateTime(booking.end_at)}`;
  const inclusions = details.inclusions
    .map((item) => `<li style="margin-bottom:6px">${escapeEmailHtml(item)}</li>`)
    .join("");
  const corkage = details.corkage
    .map((item) => `<li style="margin-bottom:6px">${escapeEmailHtml(item)}</li>`)
    .join("");
  const advanceOrderNote = Number(details.consumableAmount || 0) > 0
    ? `<div style="margin:20px 0;padding:14px 16px;border-radius:8px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412">
        <b>Advance order required:</b> Please send us your food and drink order at least one day before your booking date so we can prepare it in advance.
      </div>`
    : "";

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937;max-width:680px;margin:auto">
      <h2 style="color:#166534">Your function room booking is confirmed!</h2>
      <p>Hi ${escapeEmailHtml(booking.customer_name || "Customer")},</p>
      <p>Your booking has been reviewed and approved. We look forward to hosting your event at JUJA Brew &amp; Bites.</p>

      <h3 style="margin-top:24px">Booking details</h3>
      <table style="border-collapse:collapse;width:100%">
        <tbody>
          <tr><td style="padding:6px 12px 6px 0"><b>Booking ID</b></td><td>${escapeEmailHtml(booking.id)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0"><b>Event</b></td><td>${escapeEmailHtml(booking.event_type || "-")}</td></tr>
          <tr><td style="padding:6px 12px 6px 0"><b>Date</b></td><td>${escapeEmailHtml(formatDate(booking.business_date, "-"))}</td></tr>
          <tr><td style="padding:6px 12px 6px 0"><b>Time</b></td><td>${escapeEmailHtml(timeLabel)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0"><b>Guests</b></td><td>${escapeEmailHtml(booking.guest_count || "-")}</td></tr>
          ${Number(booking.extension_hours || 0) > 0 ? `<tr><td style="padding:6px 12px 6px 0"><b>Extension</b></td><td>${escapeEmailHtml(booking.extension_hours)} hour(s)</td></tr>` : ""}
          <tr><td style="padding:6px 12px 6px 0"><b>Reservation fee</b></td><td>${escapeEmailHtml(peso(booking.deposit_amount))}</td></tr>
        </tbody>
      </table>

      <h3 style="margin-top:24px">Selected package</h3>
      <p><b>${escapeEmailHtml(packageName)}</b><br>
        Rental fee: ${escapeEmailHtml(peso(rentalFee))}<br>
        Capacity: up to ${escapeEmailHtml(capacity || booking.guest_count || "-")} guests
        ${Number(details.consumableAmount || 0) > 0 ? `<br>Consumable food and drink credit: ${escapeEmailHtml(peso(details.consumableAmount))}` : ""}
      </p>
      <p><b>Duration:</b> 3 hours${Number(booking.extension_hours || 0) > 0 ? ` plus ${escapeEmailHtml(booking.extension_hours)} admin-approved extension hour(s)` : ""}</p>
      ${details.additionalGuests ? `<p><b>Additional guests:</b> ${escapeEmailHtml(details.additionalGuests)}</p>` : ""}
      ${inclusions ? `<p><b>Package inclusions:</b></p><ul>${inclusions}</ul>` : ""}
      ${details.foodPolicy ? `<p><b>Food and beverage policy:</b> ${escapeEmailHtml(details.foodPolicy)}</p>` : ""}
      ${corkage ? `<p><b>Corkage fees:</b></p><ul>${corkage}</ul>` : ""}
      ${advanceOrderNote}

      <p>If you need to coordinate your advance order or other event details, please contact us at 0939-9228383 or at www.facebook.com/jujabrewandbites.</p>
      <p>Thank you,<br><b>JUJA Brew &amp; Bites</b></p>
    </div>
  `;
}

