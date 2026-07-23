import crypto from "crypto";

const DEFAULT_BASE_URL = "https://rest.sandbox.lalamove.com";

function clean(value) {
  return String(value || "").trim();
}

function envNumber(name) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : null;
}

export function getLalamoveConfig() {
  const apiKey = clean(process.env.LALAMOVE_API_KEY);
  const apiSecret = clean(process.env.LALAMOVE_API_SECRET);
  return {
    apiKey,
    apiSecret,
    baseUrl: clean(process.env.LALAMOVE_API_BASE_URL) || DEFAULT_BASE_URL,
    market: clean(process.env.LALAMOVE_MARKET) || "PH",
    language: clean(process.env.LALAMOVE_LANGUAGE) || "en_PH",
    serviceType: clean(process.env.LALAMOVE_SERVICE_TYPE) || "MOTORCYCLE",
    senderName: clean(process.env.LALAMOVE_SENDER_NAME) || "JUJA Brew & Bites",
    senderPhone: clean(process.env.LALAMOVE_SENDER_PHONE),
    priorityFee: envNumber("LALAMOVE_PRIORITY_FEE") ?? envNumber("LALAMOVE_PRIORITY_FEE_PHP") ?? 0,
    defaultPickupLat: envNumber("LALAMOVE_DEFAULT_PICKUP_LAT"),
    defaultPickupLng: envNumber("LALAMOVE_DEFAULT_PICKUP_LNG"),
    configured: Boolean(apiKey && apiSecret),
  };
}

function stringifyBody(body) {
  if (!body) return "";
  return JSON.stringify(body);
}

function signRequest({ method, path, body, timestamp, apiSecret }) {
  const raw = `${timestamp}\r\n${method.toUpperCase()}\r\n${path}\r\n\r\n${body}`;
  return crypto.createHmac("sha256", apiSecret).update(raw).digest("hex");
}

export async function lalamoveRequest(method, path, body) {
  const config = getLalamoveConfig();
  if (!config.configured) {
    const error = new Error("Lalamove API keys are not configured.");
    error.code = "LALAMOVE_NOT_CONFIGURED";
    throw error;
  }

  const bodyString = stringifyBody(body);
  const timestamp = Date.now().toString();
  const signature = signRequest({
    method,
    path,
    body: bodyString,
    timestamp,
    apiSecret: config.apiSecret,
  });

  const response = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `hmac ${config.apiKey}:${timestamp}:${signature}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Market: config.market,
      "Request-ID": crypto.randomUUID(),
    },
    body: bodyString || undefined,
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.errors?.[0]?.message ||
      payload?.error ||
      `Lalamove request failed with status ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function storeAddress(store) {
  return clean(store?.address || store?.store_address || store?.location || store?.name || store?.store_name);
}

function storeName(store) {
  return clean(store?.store_name || store?.name) || "JUJA Brew & Bites";
}

function pickupCoordinates(store, config) {
  const lat = Number(store?.latitude ?? config.defaultPickupLat);
  const lng = Number(store?.longitude ?? config.defaultPickupLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: String(lat), lng: String(lng) };
}

function dropoffCoordinates(order) {
  const lat = Number(order?.delivery_latitude ?? order?.dropoff_latitude);
  const lng = Number(order?.delivery_longitude ?? order?.dropoff_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: String(lat), lng: String(lng) };
}

function deliveryContact(order) {
  return clean(order?.customer_contact || order?.contact_number || order?.phone || order?.mobile);
}

function deliveryServiceLevel(order) {
  const value = clean(order?.delivery_service_level || order?.deliveryServiceLevel).toLowerCase();
  return value === "priority" ? "priority" : "regular";
}

export function buildLalamoveQuotePayload({ order, store }) {
  const config = getLalamoveConfig();
  const pickup = pickupCoordinates(store, config);
  if (!pickup) {
    throw new Error("Store pickup latitude/longitude is required before requesting a Lalamove quote.");
  }

  const dropoffAddress = clean(order?.delivery_address || order?.address);
  if (!dropoffAddress) throw new Error("Delivery address is required before requesting a Lalamove quote.");
  const dropoff = dropoffCoordinates(order);

  return {
    data: {
      serviceType: config.serviceType,
      language: config.language,
      stops: [
        {
          coordinates: pickup,
          address: storeAddress(store),
        },
        {
          ...(dropoff ? { coordinates: dropoff } : {}),
          address: dropoffAddress,
        },
      ],
      item: {
        quantity: "1",
        weight: "LESS_THAN_3KG",
        categories: ["FOOD_DELIVERY"],
        handlingInstructions: ["KEEP_UPRIGHT"],
      },
      isRouteOptimized: false,
    },
  };
}

export function buildLalamoveOrderPayload({ order, store, quotationId, quotationResponse }) {
  const config = getLalamoveConfig();
  const pickup = pickupCoordinates(store, config);
  if (!pickup) {
    throw new Error("Store pickup latitude/longitude is required before booking Lalamove.");
  }

  const recipientPhone = deliveryContact(order);
  if (!recipientPhone) throw new Error("Customer contact number is required before booking Lalamove.");

  const stops = quotationResponse?.data?.stops || quotationResponse?.stops || [];
  const pickupStopId = stops?.[0]?.stopId || 0;
  const dropoffStopId = stops?.[1]?.stopId || 1;

  return {
    data: {
      quotationId,
      sender: {
        stopId: pickupStopId,
        name: clean(store?.delivery_contact_name) || config.senderName || storeName(store),
        phone: clean(store?.delivery_contact_phone) || config.senderPhone || recipientPhone,
      },
      recipients: [
        {
          stopId: dropoffStopId,
          name: clean(order?.customer_name) || "Web Customer",
          phone: recipientPhone,
          remarks: clean(order?.delivery_address),
        },
      ],
      metadata: {
        restaurantOrderId: String(order?.id || ""),
        restaurantReceipt: clean(order?.receipt_number || order?.order_number),
        deliveryServiceLevel: deliveryServiceLevel(order),
      },
    },
  };
}

export function parseQuoteSummary(payload) {
  const data = payload?.data || payload || {};
  const price = data?.priceBreakdown?.total || data?.totalFee || data?.price || {};
  const priceBreakdown = data?.priceBreakdown || {};
  const moneyAmount = (value) => {
    if (value == null) return 0;
    if (typeof value === "object") return Number(value.amount ?? value.value ?? 0) || 0;
    return Number(value) || 0;
  };
  const findNamedFee = (source, matcher) => {
    if (!source) return 0;
    if (Array.isArray(source)) {
      const row = source.find((entry) => matcher(String(entry?.name || entry?.label || entry?.type || entry?.key || "")));
      return moneyAmount(row?.amount ?? row?.value ?? row?.fee ?? row?.price);
    }
    if (typeof source === "object") {
      for (const [key, value] of Object.entries(source)) {
        if (matcher(key)) return moneyAmount(value);
        if (value && typeof value === "object") {
          const label = String(value.name || value.label || value.type || value.key || "");
          if (matcher(label)) return moneyAmount(value.amount ?? value.value ?? value.fee ?? value.price);
        }
      }
    }
    return 0;
  };
  const total = Number(price?.amount ?? price) || null;
  const regularFee = Number(priceBreakdown?.totalExcludePriorityFee ?? total) || null;
  const namedPriorityDeliveryFee = findNamedFee(priceBreakdown, (label) => /delivery\s*fee.*priority|priority.*delivery\s*fee/i.test(label));
  const explicitPriorityFee = Number(priceBreakdown?.priorityFee || data?.priorityFee || 0) || 0;
  const inferredPriorityFee = regularFee && total && total > regularFee ? total - regularFee : 0;
  const priorityTotalFee = namedPriorityDeliveryFee || null;
  const priorityFee =
    explicitPriorityFee ||
    (priorityTotalFee && regularFee ? Math.max(priorityTotalFee - regularFee, 0) : 0) ||
    inferredPriorityFee ||
    0;
  return {
    quoteId: clean(data?.quotationId || data?.quoteId || data?.id),
    fee: total,
    regularFee,
    priorityFee,
    priorityTotalFee,
    currency: clean(price?.currency || data?.currency) || null,
    distanceMeters: Number(data?.distance?.value || data?.distance || data?.distanceMeters) || null,
  };
}

export function parseOrderSummary(payload) {
  const data = payload?.data || payload || {};
  return {
    orderId: clean(data?.orderId || data?.id),
    status: clean(data?.status) || "booked",
    shareLink: clean(data?.shareLink || data?.shareUrl),
    trackingLink: clean(data?.trackingLink || data?.trackingUrl),
  };
}
