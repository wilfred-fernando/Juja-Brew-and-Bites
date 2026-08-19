import { createHmac, timingSafeEqual } from "node:crypto";

const GRAPH_API_ORIGIN = "https://graph.facebook.com";

function clean(value) {
  return String(value || "").trim();
}

function messengerConfig() {
  let pageAccessTokens = {};
  try {
    const parsed = JSON.parse(clean(process.env.META_PAGE_ACCESS_TOKENS) || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      pageAccessTokens = Object.fromEntries(
        Object.entries(parsed).map(([pageId, token]) => [clean(pageId), clean(token)]).filter(([pageId, token]) => pageId && token)
      );
    }
  } catch {
    pageAccessTokens = {};
  }
  return {
    appSecret: clean(process.env.META_APP_SECRET),
    graphApiVersion: clean(process.env.META_GRAPH_API_VERSION),
    orderUrl: clean(process.env.MESSENGER_ORDER_URL),
    pageAccessToken: clean(process.env.META_PAGE_ACCESS_TOKEN),
    pageAccessTokens,
    verifyToken: clean(process.env.META_MESSENGER_VERIFY_TOKEN),
  };
}

function pageAccessTokenFor(pageId = "") {
  const { pageAccessToken, pageAccessTokens } = messengerConfig();
  return pageAccessTokens[clean(pageId)] || pageAccessToken;
}

export function verifyMessengerSignature(rawBody, signatureHeader) {
  const { appSecret } = messengerConfig();
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;

  const suppliedHex = signatureHeader.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const supplied = Buffer.from(suppliedHex, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function verifyMessengerChallenge(searchParams) {
  const { verifyToken } = messengerConfig();
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (!verifyToken || mode !== "subscribe" || token !== verifyToken || !challenge) return null;
  return challenge;
}

function quickReplies() {
  return [
    { content_type: "text", title: "View menu", payload: "MENU" },
    { content_type: "text", title: "Order online", payload: "ORDER" },
    { content_type: "text", title: "Store details", payload: "STORE_DETAILS" },
    { content_type: "text", title: "Talk to staff", payload: "HUMAN_HELP" },
  ];
}

function textMessage(text, includeQuickReplies = false) {
  return {
    text: text.slice(0, 2000),
    ...(includeQuickReplies ? { quick_replies: quickReplies() } : {}),
  };
}

function orderMessage(orderUrl) {
  if (!orderUrl) {
    return textMessage(
      "Online ordering is not linked yet. Please choose Talk to staff and our team will help you place an order.",
      true
    );
  }

  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: "Browse the current menu, choose your branch, and place your order online.",
        buttons: [
          { type: "web_url", url: orderUrl, title: "Order online", webview_height_ratio: "full" },
          { type: "postback", title: "Store details", payload: "STORE_DETAILS" },
        ],
      },
    },
  };
}

export function replyForMessengerEvent(event) {
  const { orderUrl } = messengerConfig();
  const payload = clean(event?.postback?.payload || event?.message?.quick_reply?.payload).toUpperCase();
  const text = clean(event?.message?.text).toLowerCase();

  if (event?.message?.is_echo || event?.delivery || event?.read || event?.reaction) return null;

  if (payload === "GET_STARTED" || /^(hi|hello|hey|start|good (morning|afternoon|evening))\b/.test(text)) {
    return textMessage("Hi! Welcome to JUJA Brew & Bites. How can I help you today?", true);
  }

  if (payload === "MENU" || payload === "ORDER" || /\b(menu|order|food|drink|coffee|delivery|pickup|pick up)\b/.test(text)) {
    return orderMessage(orderUrl);
  }

  if (payload === "STORE_DETAILS" || /\b(store|branch|address|location|open|close|hours|time)\b/.test(text)) {
    return textMessage(
      "JUJA Brew & Bites branches:\n\nVisayas Avenue: 36D Visayas Ave., Pasong Tamo, Quezon City — open daily, 10 AM to 12 midnight.\n\nCongressional Avenue: 8 Visayas Ave., Diliman, Quezon City — Monday to Saturday, 9 AM to 10 PM; closed Sunday.",
      true
    );
  }

  if (payload === "HUMAN_HELP" || /\b(human|staff|agent|person|complaint|problem|help)\b/.test(text)) {
    return textMessage(
      "A staff member can continue this conversation in Messenger. Please send your name, preferred branch, and what you need help with.",
      true
    );
  }

  if (event?.message?.attachments?.length) {
    return textMessage("Thanks for the attachment. Please add a short message explaining how our staff can help.", true);
  }

  return textMessage("I can help with our menu, online ordering, store details, or connect you with staff.", true);
}

export function messengerSendConfigured() {
  const { graphApiVersion, pageAccessToken, pageAccessTokens } = messengerConfig();
  return Boolean(graphApiVersion && (pageAccessToken || Object.keys(pageAccessTokens).length));
}

export async function getMessengerProfile(recipientId, { pageId = "" } = {}) {
  const { graphApiVersion } = messengerConfig();
  const selectedToken = pageAccessTokenFor(pageId);
  if (!graphApiVersion || !selectedToken) {
    throw new Error(`Messenger Graph API version and Page access token are required${pageId ? ` for Page ${pageId}` : ""}.`);
  }

  const fields = new URLSearchParams({ fields: "first_name,last_name,name,locale,timezone" });
  const response = await fetch(`${GRAPH_API_ORIGIN}/${graphApiVersion}/${encodeURIComponent(recipientId)}?${fields}`, {
    headers: { Authorization: `Bearer ${selectedToken}` },
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error?.message || `Messenger User Profile API failed with status ${response.status}.`);
  }
  return result;
}

export async function sendMessengerMessage(recipientId, message, { pageId = "" } = {}) {
  const { graphApiVersion } = messengerConfig();
  const selectedToken = pageAccessTokenFor(pageId);
  if (!graphApiVersion || !selectedToken) {
    throw new Error(`Messenger Graph API version and Page access token are required${pageId ? ` for Page ${pageId}` : ""}.`);
  }

  const response = await fetch(`${GRAPH_API_ORIGIN}/${graphApiVersion}/me/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${selectedToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error?.message || `Messenger Send API failed with status ${response.status}.`);
  }
  return result;
}
