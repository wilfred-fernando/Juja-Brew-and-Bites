import nodemailer from "nodemailer";
import { formatDate } from "@/lib/dateFormat";

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

    if (!adminEmail || !proofUrl) {
      return new Response("Missing adminEmail or proofUrl", { status: 400 });
    }

    // Download screenshot so we can attach it
    const imgRes = await fetch(proofUrl);
    if (!imgRes.ok) {
      return new Response("Failed to fetch proof image", { status: 400 });
    }
    const arrayBuffer = await imgRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Configure SMTP transporter (use your own email provider)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const subject = `New Function Room Booking Payment Proof — ${customerName}`;

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
      <p><b>Deposit:</b> ₱${Number(depositAmount || 0).toLocaleString()}</p>
      <p><b>Contact:</b> ${contactNumber}</p>
      <p><b>Email:</b> ${customerEmail}</p>
      <p><b>Proof URL:</b> ${proofUrl}</p>
    `;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: adminEmail,
      subject,
      html,
      attachments: [
        {
          filename: `payment-proof-${bookingId}.jpg`,
          content: buffer,
        },
      ],
    });

    return new Response("OK", { status: 200 });
  } catch (e) {
    return new Response(e?.message || "Server error", { status: 500 });
  }
}
