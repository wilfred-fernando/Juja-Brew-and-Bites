import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { confirmationHtml } from "@/lib/bookings/confirmationEmail";
import { bookingUpdatedCustomerHtml } from "@/lib/bookings/updateEmails";
import { sendNotificationEmail } from "@/lib/email/notifications";

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

export async function POST(req) {
  try {
    const { url, serviceRoleKey } = supabaseConfig();
    if (!url || !serviceRoleKey) {
      return Response.json({ error: "Supabase server configuration is incomplete." }, { status: 500 });
    }

    const admin = createSupabaseClient(url, serviceRoleKey);
    const guard = await requireAdmin(admin);
    if (!guard.allowed) return Response.json({ error: guard.error }, { status: guard.status });

    const { bookingId, action = "approve", updates = {}, adminNote = "" } = await req.json();
    if (!bookingId) return Response.json({ error: "Booking ID is required." }, { status: 400 });
    if (!["approve", "adjust"].includes(action)) {
      return Response.json({ error: "Unsupported booking approval action." }, { status: 400 });
    }

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
    const isUpdateRequest = booking.update_request_status === "pending";
    if (action === "adjust" && !isUpdateRequest) {
      return Response.json({ error: "Only a pending customer update request can be adjusted here." }, { status: 409 });
    }

    const allowedUpdateFields = new Set([
      "customer_name",
      "event_type",
      "guest_count",
      "contact_number",
      "email",
      "package_id",
      "extension_hours",
      "business_date",
      "start_at",
      "end_at",
    ]);
    const adjustedFields = {};
    if (action === "adjust") {
      for (const [key, value] of Object.entries(updates || {})) {
        if (allowedUpdateFields.has(key)) adjustedFields[key] = value;
      }
      for (const key of ["customer_name", "event_type", "contact_number", "email", "business_date", "start_at", "end_at"]) {
        if (key in adjustedFields) adjustedFields[key] = String(adjustedFields[key] || "").trim();
      }
      for (const key of ["guest_count", "package_id", "extension_hours"]) {
        if (key in adjustedFields) adjustedFields[key] = Number(adjustedFields[key]);
      }
    }

    const finalStartAt = adjustedFields.start_at || booking.start_at;
    const finalEndAt = adjustedFields.end_at || booking.end_at;
    const finalStart = new Date(finalStartAt);
    const finalEnd = new Date(finalEndAt);
    if (!finalStartAt || Number.isNaN(finalStart.getTime()) || finalStart < new Date()) {
      return Response.json({ error: "Past bookings cannot be approved." }, { status: 409 });
    }
    if (!finalEndAt || Number.isNaN(finalEnd.getTime()) || finalEnd <= finalStart) {
      return Response.json({ error: "The booking end time must be after its start time." }, { status: 400 });
    }
    if (
      ("guest_count" in adjustedFields && (!Number.isFinite(adjustedFields.guest_count) || adjustedFields.guest_count < 1)) ||
      ("package_id" in adjustedFields && (!Number.isFinite(adjustedFields.package_id) || adjustedFields.package_id < 1)) ||
      ("extension_hours" in adjustedFields && (!Number.isFinite(adjustedFields.extension_hours) || adjustedFields.extension_hours < 0))
    ) {
      return Response.json({ error: "The adjusted booking contains an invalid numeric value." }, { status: 400 });
    }

    const finalPackageId = adjustedFields.package_id || booking.package_id;
    const { data: packageRow, error: packageError } = await admin
      .from("function_room_packages")
      .select("*")
      .eq("id", finalPackageId)
      .maybeSingle();
    if (packageError) throw packageError;
    if (!packageRow) {
      return Response.json({ error: "The selected package was not found." }, { status: 400 });
    }

    const reviewNote = String(adminNote || "").trim();
    const updatePayload = {
      ...adjustedFields,
      status: "confirmed",
      payment_status: "approved",
      ...(isUpdateRequest
        ? {
            update_request_status: action === "adjust" ? "adjusted" : "approved",
            update_reviewed_at: new Date().toISOString(),
            update_admin_note: reviewNote || null,
          }
        : {}),
    };

    const { data: confirmedBooking, error: updateError } = await admin
      .from("function_room_bookings")
      .update(updatePayload)
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
        subject: isUpdateRequest
          ? `Function Room Booking Updated - ${confirmedBooking.reference_code || confirmedBooking.id}`
          : `Function Room Booking Confirmed - ${confirmedBooking.customer_name || packageName}`,
        html: isUpdateRequest
          ? bookingUpdatedCustomerHtml(confirmedBooking, packageRow, {
              reviewResult: action === "adjust" ? "Adjusted by JUJA" : "Approved as requested",
              adminNote: reviewNote,
            })
          : confirmationHtml(confirmedBooking, packageRow),
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
