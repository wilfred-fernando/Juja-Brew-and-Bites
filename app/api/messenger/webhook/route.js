import { verifyMessengerChallenge, verifyMessengerSignature } from "@/lib/messenger";
import { processMessengerWebhook } from "@/lib/messenger/router";

export const runtime = "nodejs";

export async function GET(request) {
  const challenge = verifyMessengerChallenge(request.nextUrl.searchParams);
  if (!challenge) return new Response("Messenger webhook verification failed.", { status: 403 });
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request) {
  const rawBody = await request.text();

  if (!process.env.META_APP_SECRET) {
    return Response.json({ received: false, error: "Messenger app secret is not configured." }, { status: 503 });
  }

  if (!process.env.META_PAGE_ACCESS_TOKEN || !process.env.META_GRAPH_API_VERSION) {
    return Response.json({ received: false, error: "Messenger Send API is not configured." }, { status: 503 });
  }

  if (!verifyMessengerSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return Response.json({ received: false, error: "Invalid Messenger signature." }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ received: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  if (payload?.object !== "page") {
    return Response.json({ received: false, ignored: true }, { status: 404 });
  }

  const result = await processMessengerWebhook(payload);
  return Response.json({ received: true, ...result });
}
