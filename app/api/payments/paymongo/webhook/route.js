import { checkoutSessionFromEvent, verifyPaymongoWebhook } from "@/lib/payments/paymongo";
import { paymongoAdminClient } from "@/lib/payments/server";
import { formatDateTime } from "@/lib/dateFormat";

export const runtime = "nodejs";

function paymentDetails(session) {
  const payments = session?.attributes?.payments;
  const payment = Array.isArray(payments) ? payments[0] : null;
  return {
    paymentId: payment?.id || null,
    paymentIntentId: payment?.attributes?.payment_intent_id || session?.attributes?.payment_intent?.id || null,
    paymentMethod: payment?.attributes?.source?.type || payment?.attributes?.payment_method_used || null,
    amountCentavos: Number(payment?.attributes?.amount ?? session?.attributes?.line_items?.[0]?.amount),
    paidAt: payment?.attributes?.paid_at ?? session?.attributes?.paid_at ?? null,
  };
}

function paymongoTimestampToIso(value) {
  if (value === null || value === undefined || value === "") return new Date().toISOString();

  const numeric = Number(value);
  const parsed = Number.isFinite(numeric)
    ? new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric)
    : new Date(value);

  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

async function notifyReleasedWebOrder(request, order) {
  if (!order?.id) return;
  const origin = request.nextUrl.origin;
  await fetch(`${origin}/api/web-order-notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order, storeName: order.store_name || order.store_id || order.branch_id }),
  }).catch((error) => console.warn("Paid web order email notification failed:", error?.message || error));
}

async function notifyPaidBooking(request, booking) {
  if (!booking?.id) return;
  const origin = request.nextUrl.origin;
  const timeLabel = booking.start_at
    ? `${formatDateTime(booking.start_at)} - ${formatDateTime(booking.end_at)}`
    : booking.time_label || booking.booking_time;
  await fetch(`${origin}/api/booking-notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bookingId: booking.id,
      customerName: booking.customer_name,
      customerEmail: booking.email || booking.customer_email,
      contactNumber: booking.customer_contact || booking.contact_number,
      eventType: booking.event_type,
      businessDate: booking.booking_date || booking.business_date,
      timeLabel,
      packageId: booking.package_id,
      guestCount: booking.guest_count,
      extensionHours: booking.extension_hours,
      depositAmount: booking.deposit_amount,
      notificationType: "payment_received",
      paymentMethod: "PayMongo",
    }),
  }).catch((error) => console.warn("Paid booking email notification failed:", error?.message || error));
}

export async function POST(request) {
  const rawBody = await request.text();
  try {
    if (!verifyPaymongoWebhook(rawBody, request.headers.get("paymongo-signature"))) {
      return Response.json({ received: false, error: "Invalid PayMongo signature." }, { status: 401 });
    }
    const event = JSON.parse(rawBody);
    const eventId = event?.data?.id;
    const eventType = event?.data?.attributes?.type;
    if (!eventId || !eventType) return Response.json({ received: false, error: "Invalid event payload." }, { status: 400 });

    const admin = paymongoAdminClient();
    const { data: prior } = await admin
      .from("paymongo_webhook_events")
      .select("processed_at")
      .eq("event_id", eventId)
      .maybeSingle();
    if (prior?.processed_at) return Response.json({ received: true, duplicate: true });

    await admin.from("paymongo_webhook_events").upsert({
      event_id: eventId,
      event_type: eventType,
      livemode: Boolean(event?.data?.attributes?.livemode),
      payload: event,
      processing_error: null,
    });

    if (eventType === "checkout_session.payment.paid") {
      const session = checkoutSessionFromEvent(event);
      const { data: ledger, error: ledgerError } = await admin
        .from("paymongo_payments")
        .select("*")
        .eq("checkout_session_id", session?.id)
        .maybeSingle();
      if (ledgerError) throw new Error(ledgerError.message);
      // A PayMongo account may use the same webhook for other applications.
      // Acknowledge sessions that were not created by this application.
      if (!ledger) {
        await admin.from("paymongo_webhook_events").update({
          processed_at: new Date().toISOString(),
          processing_error: null,
        }).eq("event_id", eventId);
        return Response.json({ received: true, ignored: true });
      }

      const details = paymentDetails(session);
      if (Number.isFinite(details.amountCentavos) && details.amountCentavos !== Number(ledger.amount_centavos)) {
        throw new Error("Paid amount does not match the expected PayMongo amount.");
      }
      // PayMongo timestamps are Unix seconds. Store the exact payment instant in UTC;
      // the database also maintains an Asia/Manila display value for operations.
      const paidAt = paymongoTimestampToIso(details.paidAt);
      const { error: paymentUpdateError } = await admin.from("paymongo_payments").update({
        status: "paid",
        payment_id: details.paymentId,
        payment_intent_id: details.paymentIntentId,
        payment_method: details.paymentMethod,
        event_data: event,
        paid_at: paidAt,
      }).eq("id", ledger.id);
      if (paymentUpdateError) throw new Error(paymentUpdateError.message);

      if (ledger.entity_type === "booking") {
        const { data: booking, error } = await admin.from("function_room_bookings").update({
          payment_method: "PayMongo",
          payment_status: "paid",
        }).eq("id", ledger.entity_id).select("*").maybeSingle();
        if (error) throw new Error(error.message);
        await notifyPaidBooking(request, booking);
      } else {
        const releaseStatus = ledger?.metadata?.release_status === "scheduled" ? "scheduled" : "pending";
        const { data: order, error } = await admin.from("web_orders").update({
          payment_method: "PayMongo",
          payment_status: "paid",
          status: releaseStatus,
          order_status: releaseStatus,
        }).eq("id", ledger.entity_id).select("*").maybeSingle();
        if (error) throw new Error(error.message);
        await notifyReleasedWebOrder(request, order);
      }
    }

    await admin.from("paymongo_webhook_events").update({
      processed_at: new Date().toISOString(),
      processing_error: null,
    }).eq("event_id", eventId);
    return Response.json({ received: true });
  } catch (error) {
    console.error("PayMongo webhook failed:", error);
    try {
      const event = JSON.parse(rawBody);
      if (event?.data?.id) {
        await paymongoAdminClient().from("paymongo_webhook_events").upsert({
          event_id: event.data.id,
          event_type: event?.data?.attributes?.type || "unknown",
          livemode: Boolean(event?.data?.attributes?.livemode),
          payload: event,
          processing_error: error?.message || "Webhook processing failed.",
        });
      }
    } catch {}
    return Response.json({ received: false, error: error?.message || "Webhook processing failed." }, { status: 500 });
  }
}
