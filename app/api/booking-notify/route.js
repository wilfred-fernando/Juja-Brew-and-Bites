import { formatDate } from "@/lib/dateFormat";
import { notificationRecipient, sendNotificationEmail } from "@/lib/email/notifications";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function titleForNotification(type, paymentMethod, customerName) {
  if (type === "cancellation_request") {
    return `Function Room Booking Cancellation Request - ${customerName || "Customer"}`;
  }
  if (type === "payment_proof" || paymentMethod === "online") {
    return `New Function Room Booking Payment Proof - ${customerName || "Customer"}`;
  }
  if (type === "cash_payment_request" || paymentMethod === "cash") {
    return `New Function Room Cash Payment Request - ${customerName || "Customer"}`;
  }
  return `New Function Room Booking Request - ${customerName || "Customer"}`;
}

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      adminEmail,
      bookingId,
      customerName,
      eventType,
      businessDate,
      timeLabel,
      packageId,
      guestCount,
      contactNumber,
      customerEmail,
      extensionHours,
      depositAmount,
      proofUrl,
      notificationType,
      paymentMethod,
    } = body;

    const recipient = notificationRecipient(
      adminEmail,
      process.env.BOOKING_NOTIFY_EMAIL,
      process.env.ADMIN_NOTIFY_EMAIL
    );

    if (!recipient) {
      return new Response("Missing notification recipient", { status: 400 });
    }

    const attachments = [];
    if (proofUrl) {
      const imgRes = await fetch(proofUrl);
      if (!imgRes.ok) {
        return new Response("Failed to fetch proof image", { status: 400 });
      }
      const arrayBuffer = await imgRes.arrayBuffer();
      attachments.push({
        filename: `payment-proof-${bookingId || Date.now()}.jpg`,
        content: Buffer.from(arrayBuffer),
      });
    }

    const subject = titleForNotification(notificationType, paymentMethod, customerName);
    const actionLabel =
      notificationType === "cancellation_request"
        ? "Customer requested cancellation of an approved booking. Admin approval is required before converting the reservation fee to gift certificate."
        : notificationType === "booking_request"
        ? "New booking request is waiting for customer payment."
        : paymentMethod === "cash"
          ? "Customer selected cash payment. Admin confirmation is required."
          : "Online payment proof was submitted. Admin confirmation and approval are required.";

    const html = `
      <h3>${escapeHtml(subject)}</h3>
      <p>${escapeHtml(actionLabel)}</p>
      <p><b>Booking ID:</b> ${escapeHtml(bookingId || "-")}</p>
      <p><b>Name:</b> ${escapeHtml(customerName || "-")}</p>
      <p><b>Event:</b> ${escapeHtml(eventType || "-")}</p>
      <p><b>Date:</b> ${escapeHtml(formatDate(businessDate, businessDate || "-"))}</p>
      <p><b>Time:</b> ${escapeHtml(timeLabel || "-")}</p>
      <p><b>Package:</b> ${escapeHtml(packageId || "-")}</p>
      <p><b>Guests:</b> ${escapeHtml(guestCount || "-")}</p>
      <p><b>Extension Hours:</b> ${escapeHtml(extensionHours || 0)}</p>
      <p><b>Deposit:</b> PHP ${Number(depositAmount || 0).toLocaleString()}</p>
      <p><b>Payment Method:</b> ${escapeHtml(paymentMethod || "Waiting for payment")}</p>
      <p><b>Contact:</b> ${escapeHtml(contactNumber || "-")}</p>
      <p><b>Email:</b> ${escapeHtml(customerEmail || "-")}</p>
      ${proofUrl ? `<p><b>Proof URL:</b> ${escapeHtml(proofUrl)}</p>` : ""}
    `;

    const email = await sendNotificationEmail({
      to: recipient,
      subject,
      html,
      attachments,
    });

    if (!email.sent) {
      return new Response(email.publicError || "Email notification is not configured.", { status: 503 });
    }

    return new Response("OK", { status: 200 });
  } catch (e) {
    return new Response(e?.message || "Server error", { status: 500 });
  }
}
