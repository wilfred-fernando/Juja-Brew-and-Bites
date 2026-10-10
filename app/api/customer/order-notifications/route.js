import { timingSafeEqual } from "crypto";
import { drainCustomerOrderPush } from "@/lib/push/orderPushOutbox";

export const maxDuration = 240;

export async function GET(req) {
  const secret = process.env.CUSTOMER_ORDER_CRON_SECRET || process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  const actual = Buffer.from(req.headers.get("authorization") || "");
  if (!secret || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json({ results: await drainCustomerOrderPush() });
  } catch (error) {
    console.error("Customer order notification worker failed:", error.message);
    return Response.json({ error: "Unable to process order notifications." }, { status: 503 });
  }
}
