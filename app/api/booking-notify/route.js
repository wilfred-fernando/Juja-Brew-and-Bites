import { formatDate } from "@/lib/dateFormat";
import { notificationRecipient, sendNotificationEmail } from "@/lib/email/notifications";

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
    } = body;

    const recipient = notificationRecipient(
      adminEmail,
      process.env.BOOKING_NOTIFY_EMAIL,
      process.env.ADMIN_NOTIFY_EMAIL
    );

    if (!recipient || !proofUrl) {
      return new Response("Missing notification recipient or proofUrl", { status: 400 });
    }

    const imgRes = await fetch(proofUrl);
    if (!imgRes.ok) {
      return new Response("Failed to fetch proof image", { status: 400 });
    }
    const arrayBuffer = await imgRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const subject = `New Function Room Booking Payment Proof - ${customerName}`;
    const html = `
      <h3>New Booking Payment Proof</h3>
      <p><b>Booking ID:</b> ${bookingId}</p>
      <p><b>Name:</b> ${customerName}</p>
      <p><b>Event:</b> ${eventType}</p>
      <p><b>Date:</b> ${formatDate(businessDate, businessDate || "-")}</p>
      <p><b>Time:</b> ${timeLabel}</p>
      <p><b>Package:</b> ${packageId}</p>
      <p><b>Guests:</b> ${guestCount}</p>
      <p><b>Extension Hours:</b> ${extensionHours}</p>
      <p><b>Deposit:</b> PHP ${Number(depositAmount || 0).toLocaleString()}</p>
      <p><b>Contact:</b> ${contactNumber}</p>
      <p><b>Email:</b> ${customerEmail}</p>
      <p><b>Proof URL:</b> ${proofUrl}</p>
    `;

    const email = await sendNotificationEmail({
      to: recipient,
      subject,
      html,
      attachments: [
        {
          filename: `payment-proof-${bookingId}.jpg`,
          content: buffer,
        },
      ],
    });

    if (!email.sent) {
      return new Response(email.publicError || "Email notification is not configured.", { status: 503 });
    }

    return new Response("OK", { status: 200 });
  } catch (e) {
    return new Response(e?.message || "Server error", { status: 500 });
  }
}
