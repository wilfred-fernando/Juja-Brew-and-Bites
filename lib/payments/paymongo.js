import crypto from "node:crypto";

const PAYMONGO_API_URL = "https://api.paymongo.com/v1";

export function normalizePayMongoPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("09") && digits.length === 11) return `+63${digits.slice(1)}`;
  if (digits.startsWith("63") && digits.length === 12) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return undefined;
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function configuredPaymentMethods() {
  const configured = String(process.env.PAYMONGO_PAYMENT_METHODS || "card,gcash,paymaya,qrph")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(configured)];
}

export async function paymongoRequest(path, { method = "GET", body } = {}) {
  const secretKey = requiredEnv("PAYMONGO_SECRET_KEY");
  const response = await fetch(`${PAYMONGO_API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = Array.isArray(payload?.errors)
      ? payload.errors.map((error) => error?.detail || error?.code).filter(Boolean).join("; ")
      : "";
    throw new Error(details || payload?.message || `PayMongo request failed (${response.status}).`);
  }
  return payload;
}

function signatureParts(header) {
  return String(header || "")
    .split(",")
    .map((part) => part.trim().split("="))
    .reduce((result, [key, ...value]) => {
      if (key) result[key] = value.join("=");
      return result;
    }, {});
}

function safeHexEqual(left, right) {
  if (!left || !right) return false;
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false;
  try {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

export function verifyPaymongoWebhook(rawBody, signatureHeader) {
  const webhookSecret = requiredEnv("PAYMONGO_WEBHOOK_SECRET");
  const parts = signatureParts(signatureHeader);
  const timestamp = parts.t;
  if (!timestamp) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const provided = String(process.env.PAYMONGO_SECRET_KEY || "").startsWith("sk_live_") ? parts.li : parts.te;
  return safeHexEqual(expected, provided);
}

export function checkoutSessionFromEvent(event) {
  return event?.data?.attributes?.data || null;
}
