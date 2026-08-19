import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { packageConfirmationDetails } from "@/lib/bookings/packageConfirmation";
import { formatDate, formatDateTime } from "@/lib/dateFormat";
import { escapeEmailHtml, sendNotificationEmail } from "@/lib/email/notifications";

export const runtime = "nodejs";

function supabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function getRequesterUser() {
  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey) return null;

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (!error && data?.user) return data.user;

  const headerStore = await headers();
  const token = String(headerStore.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return null;

  const tokenClient = createSupabaseClient(url, anonKey);
  const { data: tokenData, error: tokenError } = await tokenClient.auth.getUser(token);
  return tokenError ? null : tokenData?.user || null;
}

async function requireAdmin(admin) {
  const requester = await getRequesterUser();
  if (!requester?.id) return { allowed: false, error: "Admin login is required.", status: 401 };

  const { data: profile, error } = await admin
    .from("profiles")
    .select("role")
    .eq("id", requester.id)
    .maybeSingle();
  if (error) return { allowed: false, error: error.message, status: 500 };

  const role = String(profile?.role || "").toLowerCase();
  if (!["admin", "super_admin"].includes(role)) {
    return { allowed: false, error: "Admin access required.", status: 403 };
  }
  return { allowed: true };
}

function peso(value) {
  return `PHP ${Number(value || 0).toLocaleString("en-PH")}`;
}

function confirmationHtml(booking, packageRow) {
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
          <tr><td style="padding:6px 12px 6px 0"><b>Reservation fee paid</b></td><td>${escapeEmailHtml(peso(booking.deposit_amount))}</td></tr>
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

export async function POST(req) {
  try {
    const { url, serviceRoleKey } = supabaseConfig();
    if (!url || !serviceRoleKey) {
      return Response.json({ error: "Supabase server configuration is incomplete." }, { status: 500 });
    }

    const admin = createSupabaseClient(url, serviceRoleKey);
    const guard = await requireAdmin(admin);
    if (!guard.allowed) return Response.json({ error: guard.error }, { status: guard.status });

    const { bookingId } = await req.json();
    if (!bookingId) return Response.json({ error: "Booking ID is required." }, { status: 400 });

    const { data: booking, error: bookingError } = await admin
      .from("function_room_bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return Response.json({ error: "Booking not found." }, { status: 404 });
    if (booking.status === "confirmed") {
      return Response.json({ error: "This booking is already confirmed." }, { status: 409 });
    }
    if (booking.status !== "pending") {
      return Response.json({ error: "Only pending bookings can be approved." }, { status: 409 });
    }
    if (new Date(booking.start_at) < new Date()) {
      return Response.json({ error: "Past bookings cannot be approved." }, { status: 409 });
    }

    const { data: packageRow, error: packageError } = await admin
      .from("function_room_packages")
      .select("*")
      .eq("id", booking.package_id)
      .maybeSingle();
    if (packageError) throw packageError;

    const { data: confirmedBooking, error: updateError } = await admin
      .from("function_room_bookings")
      .update({ status: "confirmed", payment_status: "approved" })
      .eq("id", booking.id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!confirmedBooking) {
      return Response.json({ error: "Booking status changed before approval. Please refresh and try again." }, { status: 409 });
    }

    const recipient = String(confirmedBooking.email || "").trim();
    if (!recipient) {
      return Response.json({
        success: true,
        booking: confirmedBooking,
        emailSent: false,
        emailError: "The booking has no customer email address.",
      });
    }

    const packageName = packageRow?.name || `Package ${confirmedBooking.package_id}`;
    let email;
    try {
      email = await sendNotificationEmail({
        to: recipient,
        subject: `Function Room Booking Confirmed - ${confirmedBooking.customer_name || packageName}`,
        html: confirmationHtml(confirmedBooking, packageRow),
      });
    } catch (emailError) {
      console.error("Booking confirmation email failed:", emailError);
      email = { sent: false, error: emailError?.message || "Confirmation email could not be sent." };
    }

    return Response.json({
      success: true,
      booking: confirmedBooking,
      emailSent: email.sent,
      emailError: email.sent ? "" : email.publicError || email.error || "Confirmation email could not be sent.",
    });
  } catch (error) {
    return Response.json(
      { error: error?.message || "Unable to approve the booking." },
      { status: 500 }
    );
  }
}
