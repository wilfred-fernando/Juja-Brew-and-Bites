import nodemailer from "nodemailer";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

    const recipient =
      adminEmail ||
      process.env.LOYALTY_NOTIFY_EMAIL ||
      process.env.ADMIN_NOTIFY_EMAIL ||
      process.env.BOOKING_NOTIFY_EMAIL ||
      "jujabrewandbites@gmail.com";

    if (!recipient) {
      return new Response("Missing notification recipient", { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const subject = `New Loyalty Account Link Request - ${customerName || userEmail || "Customer"}`;
    const html = `
      <h3>New Loyalty Account Link Request</h3>
      <p><b>Request ID:</b> ${escapeHtml(requestId || "-")}</p>
      <p><b>Customer Name:</b> ${escapeHtml(customerName || "-")}</p>
      <p><b>Birthday:</b> ${escapeHtml(birthday || "-")}</p>
      <p><b>Customer Email:</b> ${escapeHtml(userEmail || "-")}</p>
      <p><b>Matched Member ID:</b> ${escapeHtml(matchedMemberId || "No automatic match")}</p>
      <p>Please review this request in the Admin Loyalty page.</p>
    `;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipient,
      subject,
      html,
    });

    return new Response("OK", { status: 200 });
  } catch (e) {
    return new Response(e?.message || "Server error", { status: 500 });
  }
}
