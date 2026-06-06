import nodemailer from "nodemailer";

export const DEFAULT_NOTIFY_EMAIL = "jujabrewandbites@gmail.com";

export function escapeEmailHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function getEmailConfigStatus() {
  const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"];
  const missing = required.filter((key) => !process.env[key]);

  return {
    ready: missing.length === 0,
    missing,
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
  };
}

export function notificationRecipient(...candidates) {
  return (
    candidates.find(Boolean) ||
    process.env.ADMIN_NOTIFY_EMAIL ||
    process.env.BOOKING_NOTIFY_EMAIL ||
    DEFAULT_NOTIFY_EMAIL
  );
}

export async function sendNotificationEmail({ to, subject, html, attachments = [] }) {
  const status = getEmailConfigStatus();
  if (!status.ready) {
    return {
      sent: false,
      error: `Missing email settings: ${status.missing.join(", ")}`,
      publicError: "Email notification is not configured.",
    };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: status.port,
    secure: status.secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: status.from,
    to: to || DEFAULT_NOTIFY_EMAIL,
    subject,
    html,
    attachments,
  });

  return { sent: true, error: "", publicError: "" };
}
