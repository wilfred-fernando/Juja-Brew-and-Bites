import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

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
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        );
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
  if (tokenError || !tokenData?.user) return null;
  return tokenData.user;
}

async function requireAdmin(adminClient) {
  const requester = await getRequesterUser();
  if (!requester?.id) return { allowed: false, error: "Admin login is required.", status: 401 };

  const { data: profile, error } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", requester.id)
    .maybeSingle();

  if (error) return { allowed: false, error: error.message, status: 500 };

  const role = String(profile?.role || "").toLowerCase();
  if (!["admin", "super_admin"].includes(role)) {
    return { allowed: false, error: "Admin access required.", status: 403 };
  }

  return { allowed: true, requester };
}

function giftCertificateCode(booking) {
  const ref = String(booking?.reference_code || booking?.id || "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(-8)
    .toUpperCase();
  return `BKG-GC-${ref || Math.floor(100000 + Math.random() * 900000)}`;
}

export async function POST(req) {
  try {
    const { url, serviceRoleKey } = supabaseConfig();
    if (!url || !serviceRoleKey) {
      return Response.json(
        { error: "Supabase service role key is required for booking cancellation approval." },
        { status: 500 }
      );
    }

    const admin = createSupabaseClient(url, serviceRoleKey);
    const guard = await requireAdmin(admin);
    if (!guard.allowed) {
      return Response.json({ error: guard.error }, { status: guard.status });
    }

    const { bookingId } = await req.json();
    if (!bookingId) {
      return Response.json({ error: "Booking ID is required." }, { status: 400 });
    }

    const { data: booking, error: bookingError } = await admin
      .from("function_room_bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) throw bookingError;
    if (!booking) return Response.json({ error: "Booking not found." }, { status: 404 });
    if (booking.status !== "cancellation_requested") {
      return Response.json(
        { error: "Only cancellation-requested bookings can be converted to gift certificate." },
        { status: 409 }
      );
    }

    const amount = Number(booking.deposit_amount || 0);
    const gcPayload = {
      booking_id: booking.id,
      code: giftCertificateCode(booking),
      customer_name: booking.customer_name || null,
      customer_email: booking.email || null,
      customer_contact: booking.contact_number || null,
      amount,
      status: "active",
      approved_by: guard.requester.id,
      notes: "Reservation fee converted after approved booking cancellation.",
    };

    const { data: giftCertificate, error: gcError } = await admin
      .from("booking_cancellation_gift_certificates")
      .upsert(gcPayload, { onConflict: "booking_id" })
      .select("*")
      .single();

    if (gcError) throw gcError;

    const { error: updateError } = await admin
      .from("function_room_bookings")
      .update({ status: "cancelled_gc" })
      .eq("id", booking.id);

    if (updateError) throw updateError;

    return Response.json({
      success: true,
      booking: { ...booking, status: "cancelled_gc" },
      giftCertificate,
    });
  } catch (error) {
    return Response.json(
      { error: error?.message || "Unable to approve booking cancellation." },
      { status: 500 }
    );
  }
}
