import { formatDate } from "@/lib/dateFormat";
import { notificationRecipient, sendNotificationEmail } from "@/lib/email/notifications";
import { normalizePublicHttpUrl } from "@/lib/storage/publicUrl";

export const runtime = "nodejs";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function titleForNotification(type, paymentMethod, customerName) {
  const normalizedPaymentMethod = String(paymentMethod || "").trim().toLowerCase();
  if (type === "payment_received" || normalizedPaymentMethod === "paymongo") {
    return `Function Room Reservation Fee Paid - ${customerName || "Customer"}`;
  }
  if (type === "cancellation_request") {
    return `Function Room Booking Cancellation Request - ${customerName || "Customer"}`;
  }
  if (type === "payment_proof" || normalizedPaymentMethod === "qrph" || normalizedPaymentMethod === "online") {
    return `New Function Room QRPH Payment Proof - ${customerName || "Customer"}`;
  }
  if (type === "cash_payment_request" || normalizedPaymentMethod === "cash") {
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

    const normalizedProofUrl = normalizePublicHttpUrl(proofUrl);
    const attachments = [];
    let attachmentWarning = "";
    if (normalizedProofUrl) {
      try {
        const imgRes = await fetch(normalizedProofUrl, {
          signal: AbortSignal.timeout(10000),
          cache: "no-store",
        });
        if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
        const contentType = imgRes.headers.get("content-type") || "image/jpeg";
        const extension = contentType.includes("pdf")
          ? "pdf"
          : contentType.includes("png")
            ? "png"
            : contentType.includes("webp")
              ? "webp"
              : "jpg";
        attachments.push({
          filename: `payment-proof-${bookingId || Date.now()}.${extension}`,
          content: Buffer.from(await imgRes.arrayBuffer()),
          contentType,
        });
      } catch (error) {
        attachmentWarning = `Proof attachment could not be downloaded: ${error?.message || "unknown error"}`;
        console.warn("Booking proof attachment skipped:", attachmentWarning);
      }
    }

    const subject = titleForNotification(notificationType, paymentMethod, customerName);
    const normalizedPaymentMethod = String(paymentMethod || "").trim().toLowerCase();
    const actionLabel =
      notificationType === "payment_received" || normalizedPaymentMethod === "paymongo"
        ? "PayMongo confirmed the reservation fee. The booking is ready for admin review and approval."
      : notificationType === "cancellation_request"
        ? "Customer requested cancellation of an approved booking. Admin approval is required before converting the reservation fee to gift certificate."
        : notificationType === "booking_request"
        ? "New booking request is waiting for customer payment."
        : normalizedPaymentMethod === "cash"
          ? "Customer selected cash payment. Admin confirmation is required."
          : "QRPH payment proof was submitted. Admin confirmation and approval are required.";

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
      ${Number(extensionHours || 0) > 0
        ? `<p><b>Admin Extension Hours:</b> ${escapeHtml(extensionHours)}</p>`
        : ""}
      <p><b>Deposit:</b> PHP ${Number(depositAmount || 0).toLocaleString()}</p>
      <p><b>Payment Method:</b> ${escapeHtml(paymentMethod || "Waiting for payment")}</p>
      <p><b>Contact:</b> ${escapeHtml(contactNumber || "-")}</p>
      <p><b>Email:</b> ${escapeHtml(customerEmail || "-")}</p>
      ${normalizedProofUrl ? `<p><b>Proof URL:</b> <a href="${escapeHtml(normalizedProofUrl)}">View payment proof</a></p>` : ""}
      ${attachmentWarning ? `<p><i>The proof remains available through the link above.</i></p>` : ""}
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

    return Response.json({ sent: true, attachmentIncluded: attachments.length > 0 });
  } catch (e) {
    return new Response(e?.message || "Server error", { status: 500 });
  }
}
