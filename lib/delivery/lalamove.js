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

function deliveryContact(order) {
  return clean(order?.customer_contact || order?.contact_number || order?.phone || order?.mobile);
}

export function buildLalamoveQuotePayload({ order, store }) {
  const config = getLalamoveConfig();
  const pickup = pickupCoordinates(store, config);
  if (!pickup) {
    throw new Error("Store pickup latitude/longitude is required before requesting a Lalamove quote.");
  }

  const dropoffAddress = clean(order?.delivery_address || order?.address);
  if (!dropoffAddress) throw new Error("Delivery address is required before requesting a Lalamove quote.");

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
      },
    },
  };
}

export function parseQuoteSummary(payload) {
  const data = payload?.data || payload || {};
  const price = data?.priceBreakdown?.total || data?.totalFee || data?.price || {};
  return {
    quoteId: clean(data?.quotationId || data?.quoteId || data?.id),
    fee: Number(price?.amount ?? price) || null,
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
