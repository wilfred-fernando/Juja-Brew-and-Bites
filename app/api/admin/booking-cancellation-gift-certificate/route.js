import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { cancellationGiftEmail } from "@/lib/bookings/cancellationGiftEmail";
import { renderGiftCertificateImage } from "@/lib/bookings/giftCertificateImage";
import { buildGiftCertificateDelivery } from "@/lib/bookings/giftCertificateDelivery";
import { getEmailConfigStatus, sendNotificationEmail } from "@/lib/email/notifications";

export const runtime = "nodejs";
export const maxDuration = 60;

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

async function context() {
  const { url, serviceRoleKey } = supabaseConfig();
  if (!url || !serviceRoleKey) throw new Error("Booking gift certificate service is not configured.");
  const admin = createSupabaseClient(url, serviceRoleKey);
  const guard = await requireAdmin(admin);
  return { admin, guard };
}

export async function GET(req) {
  try {
    const { admin, guard } = await context();
    if (!guard.allowed) return Response.json({ error: guard.error }, { status: guard.status });
    const query = new URL(req.url).searchParams;
    const certificateId = query.get("certificateId");
    if (certificateId) {
      if (!/^[0-9a-f-]{36}$/i.test(certificateId)) return Response.json({ error: "Invalid certificate ID." }, { status: 400 });
      const { data: certificate, error } = await admin.from("booking_gc_certificates")
        .select("*, booking_gc_batches!inner(expires_at,status)").eq("id", certificateId).maybeSingle();
      if (error) throw error;
      if (!certificate) return Response.json({ error: "Certificate not found." }, { status: 404 });
      const batch = certificate.booking_gc_batches;
      const png = await renderGiftCertificateImage({ code: certificate.code, amount: certificate.amount, expiresAt: batch.expires_at,
        preview: certificate.status !== "active" || batch.status !== "approved" || new Date(batch.expires_at).getTime() <= Date.now() });
      return new Response(new Uint8Array(png), { headers: {
        "Content-Type": "image/png", "Cache-Control": "private, no-store",
        "Content-Disposition": `${query.get("download") === "1" ? "attachment" : "inline"}; filename="${certificate.code}.png"`,
        "X-Content-Type-Options": "nosniff",
      } });
    }
    let batchesQuery = admin.from("booking_gc_batches")
      .select("*, booking_gc_certificates(*), function_room_bookings(status,payment_status), gc_purchases(*)")
      .not(query.get("source") === "purchase" ? "purchase_id" : "booking_id", "is", null)
      .order("status", { ascending: false }).order("created_at", { ascending: false }).limit(200);
    if (query.get("history") !== "1") batchesQuery = batchesQuery.neq("status", "rejected");
    const { data, error } = await batchesQuery;
    if (error) throw error;
    return Response.json({ batches: data.map((batch) => {
      const certificates = batch.booking_gc_certificates.sort((a,b) => a.sequence_number-b.sequence_number);
      return { ...batch, booking_gc_certificates: certificates, email: cancellationGiftEmail(batch, certificates) };
    }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { admin, guard } = await context();
    if (!guard.allowed) return Response.json({ error: guard.error }, { status: guard.status });
    const { bookingId, batchId, action = "cancel", paymentVerified = false, reason = "" } = await req.json();
    if (action === "cancel" || action === "admin_cancel") {
      if (!bookingId) return Response.json({ error: "Booking ID is required." }, { status: 400 });
      // The database trigger queues the certificates in the same transaction.
      let cancellation = admin.from("function_room_bookings")
        .update({ status: "cancelled" }).eq("id", bookingId);
      cancellation = action === "admin_cancel"
        ? cancellation.in("status", ["pending", "confirmed", "cancellation_requested"]).gte("start_at", new Date().toISOString())
        : cancellation.eq("status", "cancellation_requested");
      const { data: booking, error } = await cancellation.select("*").maybeSingle();
      if (error) throw error;
      if (!booking) return Response.json({ error: "Booking is no longer eligible for cancellation. Refresh and check its status." }, { status: 409 });
      return Response.json({ success: true, booking });
    }
    if (action === "reject_purchase" && batchId) {
      const { error } = await admin.rpc("review_gc_purchase", { p_batch_id: batchId, p_actor: guard.requester.id,
        p_approve: false, p_payment_verified: false, p_reason: reason });
      return error ? Response.json({ error: error.message }, { status: 409 }) : Response.json({ success: true });
    }
    if (action !== "approve_email" || !batchId) {
      return Response.json({ error: "A valid action and batch ID are required." }, { status: 400 });
    }
    if (!getEmailConfigStatus().ready) {
      return Response.json({ error: "Email notification is not configured." }, { status: 503 });
    }
    const { data: sourceBatch, error: sourceError } = await admin.from("booking_gc_batches").select("purchase_id").eq("id", batchId).single();
    if (sourceError) throw sourceError;
    const { error: approvalError } = await admin.rpc(sourceBatch.purchase_id ? "review_gc_purchase" : "approve_booking_gc_batch", {
      p_batch_id: batchId, p_actor: guard.requester.id,
      ...(sourceBatch.purchase_id ? { p_approve: true, p_payment_verified: paymentVerified === true } : {}),
    });
    if (approvalError) return Response.json({ error: approvalError.message }, { status: 409 });
    // A conditional claim prevents concurrent approval clicks from sending twice.
    const { data: batch, error: claimError } = await admin.from("booking_gc_batches")
      .update({ email_status: "sending", email_started_at: new Date().toISOString(), email_error: null })
      .eq("id", batchId).eq("status", "approved").in("email_status", ["pending", "failed"])
      .select("*").maybeSingle();
    if (claimError) throw claimError;
    if (!batch) return Response.json({ error: "Email is already sent or sending. Refresh to see its status." }, { status: 409 });
    let sent = false;
    try {
      const { data: certificates, error } = await admin.from("booking_gc_certificates")
        .select("*").eq("batch_id", batch.id).order("sequence_number");
      if (error) throw error;
      const delivery = await buildGiftCertificateDelivery(batch, certificates);
      const result = await sendNotificationEmail({ to: batch.customer_email, ...delivery });
      if (!result.sent) throw new Error(result.publicError || "Email could not be sent.");
      sent = true;
      const { error: saveError } = await admin.from("booking_gc_batches")
        .update({ email_status: "sent", emailed_at: new Date().toISOString() }).eq("id", batch.id);
      if (saveError) throw saveError;
      return Response.json({ success: true, emailSent: true });
    } catch {
      if (!sent) {
        const { error: saveError } = await admin.from("booking_gc_batches")
          .update({ email_status: "failed", email_error: "Email failed. Verify delivery before retrying." }).eq("id", batch.id);
        if (saveError) console.error("Unable to record GC email failure", saveError.message);
      }
      return Response.json({ error: sent
        ? "Email was sent, but delivery status could not be saved. Do not resend; contact support."
        : "Certificates approved, but email failed. Verify delivery before retrying from the approval panel." }, { status: 502 });
    }
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to process gift certificates." }, { status: 500 });
  }
}
