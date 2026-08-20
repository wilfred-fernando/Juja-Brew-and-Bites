import { messengerSendConfigured, verifyMessengerChallenge, verifyMessengerSignature } from "@/lib/messenger";
import { processMessengerWebhook } from "@/lib/messenger/router";

export const runtime = "nodejs";

export async function GET(request) {
  const challenge = verifyMessengerChallenge(request.nextUrl.searchParams);
  if (!challenge) return new Response("Messenger webhook verification failed.", { status: 403 });
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request) {
  const requestId = crypto.randomUUID();
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  console.info("[messenger-webhook] received", {
    requestId,
    contentLength: rawBody.length,
    hasSignature: Boolean(signature),
  });

  if (!process.env.META_APP_SECRET) {
    console.error("[messenger-webhook] rejected: missing app secret", { requestId });
    return Response.json({ received: false, error: "Messenger app secret is not configured." }, { status: 503 });
  }

  if (!messengerSendConfigured()) {
    console.error("[messenger-webhook] rejected: send API not configured", { requestId });
    return Response.json({ received: false, error: "Messenger Send API is not configured." }, { status: 503 });
  }

  if (!verifyMessengerSignature(rawBody, signature)) {
    console.warn("[messenger-webhook] rejected: invalid signature", { requestId, hasSignature: Boolean(signature) });
    return Response.json({ received: false, error: "Invalid Messenger signature." }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.warn("[messenger-webhook] rejected: invalid JSON", { requestId });
    return Response.json({ received: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  if (payload?.object !== "page") {
    console.info("[messenger-webhook] ignored: unsupported object", { requestId, object: payload?.object || null });
    return Response.json({ received: false, ignored: true }, { status: 404 });
  }

  const result = await processMessengerWebhook(payload);
  console.info("[messenger-webhook] processed", { requestId, ...result });
  return Response.json({ received: true, ...result });
}
