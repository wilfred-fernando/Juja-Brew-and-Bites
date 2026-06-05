import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import nodemailer from "nodemailer";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getRequestUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

async function sendLinkRequestEmail({ requestId, customerName, birthday, userEmail, matchedMemberId }) {
  const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return { sent: false, error: `Missing email settings: ${missing.join(", ")}` };
  }

  const recipient =
    process.env.LOYALTY_NOTIFY_EMAIL ||
    process.env.ADMIN_NOTIFY_EMAIL ||
    process.env.BOOKING_NOTIFY_EMAIL ||
    "jujabrewandbites@gmail.com";

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: recipient,
    subject: `New Loyalty Account Link Request - ${customerName || userEmail || "Customer"}`,
    html: `
      <h3>New Loyalty Account Link Request</h3>
      <p><b>Request ID:</b> ${escapeHtml(requestId || "-")}</p>
      <p><b>Customer Name:</b> ${escapeHtml(customerName || "-")}</p>
      <p><b>Birthday:</b> ${escapeHtml(birthday || "-")}</p>
      <p><b>Customer Email:</b> ${escapeHtml(userEmail || "-")}</p>
      <p><b>Matched Member ID:</b> ${escapeHtml(matchedMemberId || "No automatic match")}</p>
      <p>Please review this request in the Admin Loyalty page.</p>
    `,
  });

  return { sent: true, error: "" };
}

export async function POST(req) {
  try {
    const user = await getRequestUser();
    if (!user?.id) {
      return Response.json({ error: "Customer login is required." }, { status: 401 });
    }

    const { customerName, birthday, matchedMemberId } = await req.json();
    if (!String(customerName || "").trim() || !String(birthday || "").trim()) {
      return Response.json({ error: "Full name and birthday are required." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabaseAdmin
      .from("loyalty_link_requests")
      .insert({
        user_id: user.id,
        input_name: String(customerName).trim(),
        input_birthday: String(birthday).trim(),
        matched_member_id: matchedMemberId ? String(matchedMemberId) : null,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const email = await sendLinkRequestEmail({
      requestId: data?.id,
      customerName,
      birthday,
      userEmail: user.email,
      matchedMemberId,
    });

    return Response.json({
      success: true,
      request: data,
      emailSent: email.sent,
      emailError: email.error,
    });
  } catch (err) {
    return Response.json({ error: err?.message || "Unable to send link request." }, { status: 500 });
  }
}
