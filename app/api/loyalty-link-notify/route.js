import { escapeEmailHtml, notificationRecipient, sendNotificationEmail } from "@/lib/email/notifications";

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      adminEmail,
      requestId,
      customerName,
      birthday,
      userEmail,
      matchedMemberId,
    } = body;

    const recipient = notificationRecipient(
      adminEmail,
      process.env.LOYALTY_NOTIFY_EMAIL,
      process.env.ADMIN_NOTIFY_EMAIL
    );

    if (!recipient) {
      return new Response("Missing notification recipient", { status: 400 });
    }

    const subject = `New Loyalty Account Link Request - ${customerName || userEmail || "Customer"}`;
    const html = `
      <h3>New Loyalty Account Link Request</h3>
      <p><b>Request ID:</b> ${escapeEmailHtml(requestId || "-")}</p>
      <p><b>Customer Name:</b> ${escapeEmailHtml(customerName || "-")}</p>
      <p><b>Birthday:</b> ${escapeEmailHtml(birthday || "-")}</p>
      <p><b>Customer Email:</b> ${escapeEmailHtml(userEmail || "-")}</p>
      <p><b>Matched Member ID:</b> ${escapeEmailHtml(matchedMemberId || "No automatic match")}</p>
      <p>Please review this request in the Admin Loyalty page.</p>
    `;

    const email = await sendNotificationEmail({
      to: recipient,
      subject,
      html,
    });

    if (!email.sent) {
      return new Response(email.publicError || "Email notification is not configured.", { status: 503 });
    }

    return new Response("OK", { status: 200 });
  } catch (e) {
    return new Response(e?.message || "Server error", { status: 500 });
  }
}
