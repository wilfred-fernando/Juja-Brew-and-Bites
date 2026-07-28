import crypto from "crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function base64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function serviceAccountConfig() {
  const rawJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      return {
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key,
      };
    } catch (error) {
      console.warn("Invalid FCM_SERVICE_ACCOUNT_JSON:", error);
    }
  }

  return {
    projectId: process.env.FCM_PROJECT_ID,
    clientEmail: process.env.FCM_CLIENT_EMAIL,
    privateKey: process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  };
}

async function getFcmAccessToken() {
  const { clientEmail, privateKey } = serviceAccountConfig();
  if (!clientEmail || !privateKey) {
    throw new Error("FCM credentials are not configured.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: FCM_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer
    .sign(privateKey, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || payload?.error || "Unable to get FCM access token.");
  }
  return payload.access_token;
}

export function isFcmConfigured() {
  const { projectId, clientEmail, privateKey } = serviceAccountConfig();
  return Boolean(projectId && clientEmail && privateKey);
}

export function serviceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role key is required.");
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}

function orderStatusMessage(order, status) {
  const shortId = String(order?.receipt_number || order?.order_number || order?.id || "").slice(0, 8).toUpperCase();
  const total = Number(order?.total ?? order?.subtotal ?? 0);
  const totalText = Number.isFinite(total) && total > 0 ? ` Total PHP ${total.toFixed(2)}.` : "";
  const label = shortId ? `Order #${shortId}` : "Your order";
  const deliveryStatus = String(order?.delivery_status || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

  if (status === "ready") {
    return {
      title: "JUJA Brew & Bites",
      body: `Ready now - ${label} is ready for pickup or delivery.`,
      summaryText: "Order ready",
      largeBody: `Ready now - ${label} is ready for pickup or delivery.${totalText} Tap to view your order status.`,
    };
  }

  if (status === "preparing") {
    return {
      title: "JUJA Brew & Bites",
      body: `${label} is being prepared.`,
      summaryText: "Order preparing",
      largeBody: `${label} is now in the kitchen and being prepared.${totalText} Tap to view your order status.`,
    };
  }

  if (status === "delivery_update") {
    return {
      title: "JUJA Brew & Bites",
      body: `Delivery update - ${label}: ${deliveryStatus || "Rider status updated"}.`,
      summaryText: "Delivery update",
      largeBody: `Delivery update - ${label}: ${deliveryStatus || "Rider status updated"}.${totalText} Tap to view delivery tracking.`,
    };
  }

  return {
    title: "JUJA Brew & Bites",
    body: `Completed - ${label} has been completed. Thank you!`,
    summaryText: "Order completed",
    largeBody: `Completed - ${label} has been completed. Thank you for ordering from JUJA Brew & Bites.${totalText}`,
  };
}

function voucherLabel(voucher) {
  const reward = String(voucher?.reward_text || "").trim();
  if (reward) return reward;
  const code = String(voucher?.code || "").trim();
  return code ? `Voucher ${code}` : "your JUJA voucher";
}

function voucherStatusMessage(voucher, eventType) {
  const label = voucherLabel(voucher);
  if (eventType === "expiring_3_days") {
    return {
      title: "JUJA Rewards Voucher",
      body: `${label} expires in 3 days.`,
      summaryText: "Voucher expiring soon",
      largeBody: `${label} expires in 3 days. Tap to view your vouchers.`,
    };
  }
  if (eventType === "expiring_1_day") {
    return {
      title: "JUJA Rewards Voucher",
      body: `${label} expires tomorrow.`,
      summaryText: "Voucher expires tomorrow",
      largeBody: `${label} expires tomorrow. Tap to view your vouchers.`,
    };
  }
  if (eventType === "expiring_today") {
    return {
      title: "JUJA Rewards Voucher",
      body: `${label} expires today.`,
      summaryText: "Voucher expires today",
      largeBody: `${label} expires today. Use it before it expires.`,
    };
  }
  if (eventType === "expired") {
    return {
      title: "JUJA Rewards Voucher",
      body: `${label} has expired.`,
      summaryText: "Voucher expired",
      largeBody: `${label} has expired. Tap to view your voucher ledger.`,
    };
  }
  return {
    title: "JUJA Rewards Voucher",
    body: `You earned a voucher: ${label}.`,
    summaryText: "New voucher earned",
    largeBody: `You earned a voucher: ${label}. Tap to view your vouchers.`,
  };
}

async function sendFcmToToken({ token, title, body, data }) {
  const { projectId } = serviceAccountConfig();
  if (!projectId) throw new Error("FCM project ID is not configured.");
  const accessToken = await getFcmAccessToken();

  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data,
        android: {
          priority: "HIGH",
          notification: {
            channel_id: "customer-orders-audible",
            icon: "ic_stat_juja_notification",
            sound: "notification",
            tag: data?.tag || data?.web_order_id || data?.order_id || "customer-order",
            color: "#087830",
            click_action: "OPEN_CUSTOMER_ORDER_STATUS",
          },
        },
        webpush: {
          notification: {
            icon: "/favicon.ico",
            badge: "/favicon.ico",
          },
        },
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = payload?.error?.status || payload?.error?.message || "FCM send failed.";
    throw new Error(code);
  }
  return payload;
}

async function loadEnabledPushTokens(admin, userId) {
  const { data: tokens, error: tokenError } = await admin
    .from("customer_push_tokens")
    .select("id,token")
    .eq("user_id", userId)
    .eq("enabled", true);

  if (tokenError) throw tokenError;
  return tokens || [];
}

async function reserveVoucherPushNotification(admin, voucher, eventType) {
  const { error } = await admin
    .from("voucher_push_notifications")
    .insert({
      voucher_id: voucher.id,
      member_id: voucher.member_id,
      event_type: eventType,
    });

  if (!error) return { reserved: true };
  if (error.code === "23505") return { reserved: false, duplicate: true };
  if (/voucher_push_notifications/i.test(error.message || "")) {
    return { reserved: true, warning: error.message };
  }
  throw error;
}

export async function sendCustomerVoucherPush({ voucherId, eventType = "earned", adminClient } = {}) {
  if (!voucherId) return { sent: 0, skipped: true, reason: "Missing voucher ID." };
  const normalizedEvent = String(eventType || "earned").toLowerCase();
  const validEvents = ["earned", "expiring_3_days", "expiring_1_day", "expiring_today", "expired"];
  if (!validEvents.includes(normalizedEvent)) {
    return { sent: 0, skipped: true, reason: "Voucher event does not require push." };
  }

  if (!isFcmConfigured()) {
    return { sent: 0, skipped: true, reason: "FCM credentials are not configured." };
  }

  const admin = adminClient || serviceSupabase();
  const { data: voucher, error: voucherError } = await admin
    .from("vouchers")
    .select("id,member_id,code,reward_text,reward_type,status,issued_at,expires_at,redeemed_at")
    .eq("id", voucherId)
    .maybeSingle();

  if (voucherError) throw voucherError;
  if (!voucher?.id) return { sent: 0, skipped: true, reason: "Voucher was not found." };
  const { data: member, error: memberError } = await admin
    .from("loyalty_members")
    .select("id,user_id,customer_name,customer_code")
    .eq("id", voucher.member_id)
    .maybeSingle();

  if (memberError) throw memberError;
  if (!member?.user_id) {
    return { sent: 0, skipped: true, reason: "Loyalty member is not linked to a customer account." };
  }

  const tokens = await loadEnabledPushTokens(admin, member.user_id);
  if (!tokens.length) return { sent: 0, skipped: true, reason: "Customer has no registered push token." };

  const reservation = await reserveVoucherPushNotification(admin, voucher, normalizedEvent);
  if (!reservation.reserved) {
    return { sent: 0, skipped: true, reason: "Voucher notification was already sent." };
  }

  const message = voucherStatusMessage(voucher, normalizedEvent);
  const notificationData = {
    type: "voucher",
    voucher_id: String(voucher.id),
    member_id: String(voucher.member_id),
    voucher_event: String(normalizedEvent),
    voucher_status: String(voucher.status || ""),
    url: "/customer?tab=loyalty",
    tag: `voucher:${voucher.id}:${normalizedEvent}`,
    title: String(message.title),
    body: String(message.body),
    icon: "/favicon.ico",
    summaryText: String(message.summaryText || ""),
    largeBody: String(message.largeBody || message.body),
    group: `voucher:${voucher.member_id}`,
  };
  const results = [];

  for (const row of tokens) {
    try {
      await sendFcmToToken({
        token: row.token,
        title: message.title,
        body: message.body,
        data: notificationData,
      });
      results.push({ id: row.id, ok: true });
    } catch (error) {
      const messageText = String(error?.message || "");
      results.push({ id: row.id, ok: false, error: messageText });
      if (messageText.includes("UNREGISTERED") || messageText.includes("INVALID_ARGUMENT")) {
        await admin.from("customer_push_tokens").update({ enabled: false }).eq("id", row.id);
      }
    }
  }

  const sent = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok).length;
  if (sent <= 0) {
    await admin
      .from("voucher_push_notifications")
      .delete()
      .eq("voucher_id", voucher.id)
      .eq("event_type", normalizedEvent);
  }

  return {
    sent,
    failed,
    warning: reservation.warning || "",
    results,
  };
}

export async function sendCustomerOrderStatusPush({ webOrderId, status }) {
  if (!webOrderId) return { sent: 0, skipped: true, reason: "Missing web order ID." };
  const normalizedStatus = String(status || "").toLowerCase();
  if (!["preparing", "ready", "completed", "delivered", "delivery_update"].includes(normalizedStatus)) {
    return { sent: 0, skipped: true, reason: "Status does not require push." };
  }

  if (!isFcmConfigured()) {
    return { sent: 0, skipped: true, reason: "FCM credentials are not configured." };
  }

  const admin = serviceSupabase();
  const { data: order, error: orderError } = await admin
    .from("web_orders")
    .select("id,user_id,receipt_number,order_number,status,total,subtotal,delivery_status,delivery_tracking_link,delivery_share_link")
    .eq("id", webOrderId)
    .maybeSingle();

  if (orderError) throw orderError;
  if (!order?.user_id) return { sent: 0, skipped: true, reason: "Web order has no customer user ID." };

  const tokens = await loadEnabledPushTokens(admin, order.user_id);
  if (!tokens?.length) return { sent: 0, skipped: true, reason: "Customer has no registered push token." };

  const pushStatus = normalizedStatus === "delivered" ? "completed" : normalizedStatus;
  const message = orderStatusMessage(order, pushStatus);
  const notificationData = {
    type: "order_status",
    web_order_id: String(order.id),
    status: String(pushStatus),
    url: "/customer?tab=history",
    tag: `web-order:${order.id}:${pushStatus}`,
    title: String(message.title),
    body: String(message.body),
    icon: "/favicon.ico",
    summaryText: String(message.summaryText || ""),
    largeBody: String(message.largeBody || message.body),
    group: `web-order:${order.id}`,
  };
  const results = [];

  for (const row of tokens) {
    try {
      await sendFcmToToken({
        token: row.token,
        title: message.title,
        body: message.body,
        data: notificationData,
      });
      results.push({ id: row.id, ok: true });
    } catch (error) {
      const messageText = String(error?.message || "");
      results.push({ id: row.id, ok: false, error: messageText });
      if (messageText.includes("UNREGISTERED") || messageText.includes("INVALID_ARGUMENT")) {
        await admin.from("customer_push_tokens").update({ enabled: false }).eq("id", row.id);
      }
    }
  }

  return {
    sent: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  };
}
