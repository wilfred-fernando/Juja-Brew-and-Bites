import { configuredPaymentMethods, normalizePayMongoPhone, paymongoRequest } from "@/lib/payments/paymongo";
import { paymongoAdminClient, paymongoRequester } from "@/lib/payments/server";

export const runtime = "nodejs";

function cents(value) {
  return Math.round(Number(value || 0) * 100);
}

const CHECKOUT_BREAKDOWN_VERSION = 1;

function clampText(value, maxLength = 255) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function itemQuantity(item) {
  const quantity = Number(item?.quantity ?? item?.qty ?? 1);
  return Number.isFinite(quantity) && quantity > 0 ? Math.max(1, Math.floor(quantity)) : 1;
}

function itemGrossCentavos(item) {
  const quantity = itemQuantity(item);
  const unitPrice = Number(item?.unitPrice ?? item?.unit_price ?? item?.price ?? 0);
  return Math.max(0, cents(unitPrice * quantity));
}

function itemNetCentavos(item) {
  const gross = itemGrossCentavos(item);
  const discount = Math.max(0, Math.min(gross, cents(item?.discountAmount ?? item?.discount_amount ?? 0)));
  return Math.max(0, gross - discount);
}

function optionDescription(item) {
  const groupedOptions = new Map();
  for (const option of Array.isArray(item?.selectedOptions) ? item.selectedOptions : []) {
    const groupName = clampText(option?.groupName || option?.group_name || "Option", 50);
    const optionName = clampText(option?.name, 80);
    if (!optionName) continue;
    groupedOptions.set(groupName, [...(groupedOptions.get(groupName) || []), optionName]);
  }

  const parts = [...groupedOptions.entries()].map(([group, options]) => `${group}: ${options.join(", ")}`);
  if (parts.length === 0 && item?.variantDetails) parts.push(clampText(item.variantDetails, 160));
  if (item?.instructions) parts.push(`Note: ${clampText(item.instructions, 120)}`);

  const voucher = item?.appliedVoucher;
  if (voucher) {
    const voucherLabel = clampText(voucher.reward_text || voucher.code || "Voucher", 100);
    parts.push(`Voucher: ${voucherLabel}`);
  } else {
    const discount = cents(item?.discountAmount ?? item?.discount_amount ?? 0);
    if (discount > 0) parts.push(`Discount: PHP ${(discount / 100).toFixed(2)}`);
  }

  return clampText(parts.join(" | "), 255);
}

function allocateCentavos(weights, target) {
  if (weights.length === 0 || target <= 0) return weights.map(() => 0);
  const totalWeight = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (totalWeight <= 0) return weights.map((_, index) => (index === 0 ? target : 0));

  const raw = weights.map((weight) => (Math.max(0, weight) * target) / totalWeight);
  const allocated = raw.map(Math.floor);
  let remaining = target - allocated.reduce((sum, value) => sum + value, 0);
  const remainderOrder = raw
    .map((value, index) => ({ index, remainder: value - allocated[index] }))
    .sort((left, right) => right.remainder - left.remainder);
  for (let index = 0; index < remaining; index += 1) {
    allocated[remainderOrder[index % remainderOrder.length].index] += 1;
  }
  return allocated;
}

function webOrderLineItems(entity, amountCentavos, description) {
  const items = Array.isArray(entity?.items) ? entity.items.filter(Boolean) : [];
  if (items.length === 0) {
    return [{ amount: amountCentavos, currency: "PHP", description, name: "Online Food Order", quantity: 1 }];
  }

  const requestedDeliveryFee = Math.max(0, cents(entity?.delivery_fee));
  const deliveryFee = Math.min(requestedDeliveryFee, amountCentavos);
  const merchandiseTarget = Math.max(0, amountCentavos - deliveryFee);
  const itemWeights = items.map(itemNetCentavos);
  const allocatedTotals = allocateCentavos(itemWeights, merchandiseTarget);
  const freeItemNames = [];

  const lineItems = items.flatMap((item, index) => {
    const allocatedTotal = allocatedTotals[index];
    const quantity = itemQuantity(item);
    const itemName = clampText(item?.name || item?.item_name || "Menu Item", 120);
    if (allocatedTotal <= 0) {
      freeItemNames.push(`${quantity} x ${itemName}`);
      return [];
    }

    const evenlyDivisible = allocatedTotal % quantity === 0;
    return [{
      amount: evenlyDivisible ? allocatedTotal / quantity : allocatedTotal,
      currency: "PHP",
      description: optionDescription(item) || undefined,
      name: evenlyDivisible ? itemName : clampText(`${quantity} x ${itemName}`, 120),
      quantity: evenlyDivisible ? quantity : 1,
    }];
  });

  if (deliveryFee > 0) {
    lineItems.push({
      amount: deliveryFee,
      currency: "PHP",
      description: clampText(entity?.delivery_address ? `Delivery to ${entity.delivery_address}` : "Lalamove delivery fee"),
      name: "Delivery Fee",
      quantity: 1,
    });
  }

  if (freeItemNames.length > 0 && lineItems.length > 0) {
    const freeSummary = `Included at no charge: ${freeItemNames.join(", ")}`;
    lineItems[0].description = clampText([lineItems[0].description, freeSummary].filter(Boolean).join(" | "));
  }

  return lineItems.length > 0
    ? lineItems
    : [{ amount: amountCentavos, currency: "PHP", description, name: "Online Food Order", quantity: 1 }];
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
    if (entityType === "web_order") {
      return Response.json(
        { error: "PayMongo is no longer available for web orders. Please use QRPH." },
        { status: 410 }
      );
    }
    if (entityType !== "booking" || !entityId) {
      return Response.json({ error: "A valid booking is required." }, { status: 400 });
    }

    const admin = paymongoAdminClient();
    const entity = await loadPaymentEntity(admin, entityType, entityId, requester.id);
    const amountCentavos = entityType === "booking" ? cents(entity.deposit_amount || 1000) : cents(entity.total);
    if (amountCentavos <= 0) return Response.json({ error: "Payment amount must be greater than zero." }, { status: 400 });

    const { data: existing } = await admin
      .from("paymongo_payments")
      .select("checkout_url,status,amount_centavos,metadata")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .maybeSingle();
    if (existing?.status === "paid") return Response.json({ error: "This payment is already complete." }, { status: 409 });
    if (
      existing?.status === "pending" &&
      existing.checkout_url &&
      Number(existing.amount_centavos) === amountCentavos &&
      Number(existing?.metadata?.checkout_breakdown_version) === CHECKOUT_BREAKDOWN_VERSION
    ) {
      return Response.json({ checkoutUrl: existing.checkout_url, reused: true });
    }

    const releaseStatus = body?.releaseStatus === "scheduled" ? "scheduled" : "pending";
    const referenceNumber = shortReference(entityType === "booking" ? "BOOK" : "ORDER", entityId);
    const origin = publicOrigin(request);
    const description = entityType === "booking"
      ? `JUJA function room reservation fee - ${entity.reference_code || referenceNumber}`
      : `JUJA online order - ${referenceNumber}`;
    const lineItems = entityType === "booking"
      ? [{
          amount: amountCentavos,
          currency: "PHP",
          description,
          name: "Function Room Reservation Fee",
          quantity: 1,
        }]
      : webOrderLineItems(entity, amountCentavos, description);
    const sessionPayload = await paymongoRequest("/checkout_sessions", {
      method: "POST",
      body: {
        data: {
          attributes: {
            billing: {
              name: entity.customer_name || requester.user_metadata?.full_name || "JUJA Customer",
              email: entity.email || entity.customer_email || requester.email || undefined,
              phone: normalizePayMongoPhone(entity.customer_contact || entity.contact_number),
            },
            cancel_url: `${origin}/customer?payment=cancelled&type=${entityType}&id=${entityId}`,
            description,
            line_items: lineItems,
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
      metadata: {
        release_status: releaseStatus,
        checkout_breakdown_version: CHECKOUT_BREAKDOWN_VERSION,
      },
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
