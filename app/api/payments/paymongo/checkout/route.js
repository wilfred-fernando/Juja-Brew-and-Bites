import { configuredPaymentMethods, normalizePayMongoPhone, paymongoRequest } from "@/lib/payments/paymongo";
import { paymongoAdminClient, paymongoRequester } from "@/lib/payments/server";

export const runtime = "nodejs";

function cents(value) {
  return Math.round(Number(value || 0) * 100);
}

function publicOrigin(request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") || "https";
  return host ? `${protocol}://${host}` : request.nextUrl.origin;
}

function shortReference(prefix, id) {
  return `${prefix}-${String(id || "").replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

async function loadPaymentEntity(admin, entityType, entityId, userId) {
  const table = entityType === "booking" ? "function_room_bookings" : "web_orders";
  const { data, error } = await admin.from(table).select("*").eq("id", entityId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(entityType === "booking" ? "Booking was not found." : "Web order was not found.");
  if (String(data.user_id || "") !== String(userId)) throw new Error("This payment does not belong to your account.");
  return data;
}

export async function POST(request) {
  try {
    const requester = await paymongoRequester();
    if (!requester?.id) return Response.json({ error: "Customer login is required." }, { status: 401 });

    const body = await request.json();
    const entityType = String(body?.entityType || "").trim().toLowerCase();
    const entityId = String(body?.entityId || "").trim();
    if (!['booking', 'web_order'].includes(entityType) || !entityId) {
      return Response.json({ error: "A valid booking or web order is required." }, { status: 400 });
    }

    const admin = paymongoAdminClient();
    const entity = await loadPaymentEntity(admin, entityType, entityId, requester.id);
    const amountCentavos = entityType === "booking" ? cents(entity.deposit_amount || 1000) : cents(entity.total);
    if (amountCentavos <= 0) return Response.json({ error: "Payment amount must be greater than zero." }, { status: 400 });

    const { data: existing } = await admin
      .from("paymongo_payments")
      .select("checkout_url,status,amount_centavos")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .maybeSingle();
    if (existing?.status === "paid") return Response.json({ error: "This payment is already complete." }, { status: 409 });
    if (existing?.status === "pending" && existing.checkout_url && Number(existing.amount_centavos) === amountCentavos) {
      return Response.json({ checkoutUrl: existing.checkout_url, reused: true });
    }

    const releaseStatus = body?.releaseStatus === "scheduled" ? "scheduled" : "pending";
    const referenceNumber = shortReference(entityType === "booking" ? "BOOK" : "ORDER", entityId);
    const origin = publicOrigin(request);
    const description = entityType === "booking"
      ? `JUJA function room reservation fee - ${entity.reference_code || referenceNumber}`
      : `JUJA online order - ${referenceNumber}`;
    const sessionPayload = await paymongoRequest("/checkout_sessions", {
      method: "POST",
      body: {
        data: {
          attributes: {
            billing: {
              name: entity.customer_name || requester.user_metadata?.full_name || "JUJA Customer",
              email: entity.customer_email || requester.email || undefined,
              phone: normalizePayMongoPhone(entity.customer_contact || entity.contact_number),
            },
            cancel_url: `${origin}/customer?payment=cancelled&type=${entityType}&id=${entityId}`,
            description,
            line_items: [{
              amount: amountCentavos,
              currency: "PHP",
              description,
              name: entityType === "booking" ? "Function Room Reservation Fee" : "Online Food Order",
              quantity: 1,
            }],
            payment_method_types: configuredPaymentMethods(),
            reference_number: referenceNumber,
            send_email_receipt: true,
            show_description: true,
            show_line_items: true,
            success_url: `${origin}/customer?payment=success&type=${entityType}&id=${entityId}`,
          },
        },
      },
    });
    const session = sessionPayload?.data;
    const checkoutUrl = session?.attributes?.checkout_url;
    if (!session?.id || !checkoutUrl) throw new Error("PayMongo did not return a checkout URL.");

    const ledgerPayload = {
      entity_type: entityType,
      entity_id: entityId,
      user_id: requester.id,
      checkout_session_id: session.id,
      idempotency_key: `${entityType}:${entityId}:${amountCentavos}`,
      amount_centavos: amountCentavos,
      currency: "PHP",
      status: "pending",
      checkout_url: checkoutUrl,
      reference_number: referenceNumber,
      metadata: { release_status: releaseStatus },
      event_data: sessionPayload,
      paid_at: null,
    };
    const { error: ledgerError } = await admin
      .from("paymongo_payments")
      .upsert(ledgerPayload, { onConflict: "entity_type,entity_id" });
    if (ledgerError) throw new Error(ledgerError.message);

    const targetTable = entityType === "booking" ? "function_room_bookings" : "web_orders";
    const targetUpdate = entityType === "booking"
      ? { payment_method: "PayMongo", payment_status: "checkout_pending" }
      : { payment_method: "PayMongo", payment_status: "checkout_pending", status: "payment_pending", order_status: "payment_pending" };
    const { error: updateError } = await admin.from(targetTable).update(targetUpdate).eq("id", entityId);
    if (updateError) throw new Error(updateError.message);

    return Response.json({ checkoutUrl, checkoutSessionId: session.id, referenceNumber });
  } catch (error) {
    console.error("PayMongo checkout creation failed:", error);
    return Response.json({ error: error?.message || "Unable to start PayMongo checkout." }, { status: 500 });
  }
}
