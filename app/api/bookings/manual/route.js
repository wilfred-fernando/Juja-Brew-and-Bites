import { createClient } from "@supabase/supabase-js";
import { confirmationHtml } from "@/lib/bookings/confirmationEmail";
import { sendNotificationEmail } from "@/lib/email/notifications";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return Response.json({ error: "Staff login is required." }, { status: 401 });
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await client.auth.getUser(token);
    if (authError || !auth?.user) return Response.json({ error: "Staff login is required." }, { status: 401 });
    const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
    if (profileError || !["cashier", "admin", "super_admin"].includes(String(profile?.role || "").toLowerCase())) {
      return Response.json({ error: "Only authorized staff can create manual bookings." }, { status: 403 });
    }
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return Response.json({ error: "Booking details are required." }, { status: 400 });
    }
    // Keep the existing RPC's validation, overlap checks and authenticated creator attribution.
    const { data: booking, error } = await client.rpc("create_manual_booking", { data: payload });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    if (booking.status !== "confirmed") {
      return Response.json({ booking, emailSent: false, emailError: "", emailDeferred: true });
    }
    // A mail failure must not turn a successfully created booking into a failed save.
    let email;
    try {
      if (!String(booking.email || "").trim()) throw new Error("The booking has no customer email address.");
      const { data: packageRow, error: packageError } = await client.from("function_room_packages").select("*").eq("id", booking.package_id).maybeSingle();
      if (packageError || !packageRow) throw new Error("Unable to load the booking package for confirmation.");
      email = await sendNotificationEmail({
        to: booking.email.trim(),
        subject: `Function Room Booking Confirmed - ${booking.customer_name || packageRow.name}`,
        html: confirmationHtml(booking, packageRow),
      });
    } catch (error) {
      console.error("Manual booking confirmation email failed:", error);
      email = { sent: false, publicError: "Confirmation email could not be sent. The booking is saved." };
    }
    return Response.json({ booking, emailSent: email.sent, emailError: email.sent ? "" : email.publicError || email.error });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to create manual booking." }, { status: 500 });
  }
}
