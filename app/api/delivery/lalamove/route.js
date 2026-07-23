import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import {
  buildLalamoveOrderPayload,
  buildLalamoveQuotePayload,
  getLalamoveConfig,
  lalamoveRequest,
  parseOrderSummary,
  parseQuoteSummary,
} from "@/lib/delivery/lalamove";

export const runtime = "nodejs";

function supabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function getRequesterUser() {
  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey) return null;

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (!error && data?.user) return data.user;

  const headerStore = await headers();
  const token = String(headerStore.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const tokenClient = createSupabaseClient(url, anonKey);
  const { data: tokenData, error: tokenError } = await tokenClient.auth.getUser(token);
  if (tokenError || !tokenData?.user) return null;
  return tokenData.user;
}

async function requireStaff(adminClient) {
  const requester = await getRequesterUser();
  if (!requester?.id) return { allowed: false, error: "POS login is required.", status: 401 };

  const { data: profile, error } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", requester.id)
    .maybeSingle();

  if (error) return { allowed: false, error: error.message, status: 500 };

  const role = String(profile?.role || "").toLowerCase();
  if (!["cashier", "admin", "super_admin"].includes(role)) {
    return { allowed: false, error: "Staff access required.", status: 403 };
  }

  return { allowed: true };
}

function isDeliveryOrder(order) {
  const fulfillment = String(order?.fulfillment_type || "").toLowerCase();
  const dining = String(order?.dining_option || "").toLowerCase();
  return fulfillment === "delivery" || dining.includes("delivery");
}

function storeIdForOrder(order) {
  return order?.store_id || order?.branch_id || null;
}

async function loadOrderContext(admin, webOrderId) {
  const { data: order, error: orderError } = await admin
    .from("web_orders")
    .select("*")
    .eq("id", webOrderId)
    .maybeSingle();

  if (orderError) throw new Error(orderError.message);
  if (!order) throw new Error("Web order was not found.");
  if (!isDeliveryOrder(order)) throw new Error("Lalamove can only be booked for delivery web orders.");

  const storeId = storeIdForOrder(order);
  if (!storeId) throw new Error("Web order store is missing.");

  const { data: store, error: storeError } = await admin
    .from("stores")
    .select("*")
    .eq("id", storeId)
    .maybeSingle();

  if (storeError) throw new Error(storeError.message);
  if (!store) throw new Error("Store pickup details were not found.");

  return { order, store };
}

async function saveDeliveryState(admin, webOrderId, updates) {
  const { error } = await admin
    .from("web_orders")
    .update({
      delivery_provider: "lalamove",
      ...updates,
    })
    .eq("id", webOrderId);

  if (error) throw new Error(error.message);
}

async function createQuote(admin, order, store) {
  const payload = buildLalamoveQuotePayload({ order, store });
  const response = await lalamoveRequest("POST", "/v3/quotations", payload);
  const summary = parseQuoteSummary(response);
  if (!summary.quoteId) throw new Error("Lalamove quote response did not include a quotation ID.");

  await saveDeliveryState(admin, order.id, {
    delivery_status: "quoted",
    delivery_quote_id: summary.quoteId,
    delivery_fee: summary.fee,
    delivery_currency: summary.currency,
    delivery_distance_meters: summary.distanceMeters,
    delivery_provider_payload: response,
    delivery_last_error: null,
    delivery_quoted_at: new Date().toISOString(),
  });

  return { response, summary };
}

export async function POST(req) {
  const { url, serviceRoleKey } = supabaseConfig();
  if (!url || !serviceRoleKey) {
    return Response.json({ error: "Supabase service role key is required." }, { status: 500 });
  }

  const admin = createSupabaseClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const guard = await requireStaff(admin);
  if (!guard.allowed) return Response.json({ error: guard.error }, { status: guard.status });

  let body = {};
  try {
    body = await req.json();
    const { action, webOrderId } = body;
    if (!webOrderId) return Response.json({ error: "webOrderId is required." }, { status: 400 });

    const config = getLalamoveConfig();
    if (!config.configured) {
      return Response.json({
        success: false,
        configured: false,
        message: "Lalamove is not configured yet. Add LALAMOVE_API_KEY and LALAMOVE_API_SECRET in Vercel environment settings.",
      });
    }

    const { order, store } = await loadOrderContext(admin, webOrderId);
    const normalizedAction = String(action || "quote").toLowerCase();

    if (normalizedAction === "quote") {
      const { summary, response } = await createQuote(admin, order, store);
      return Response.json({ success: true, action: "quote", summary, raw: response });
    }

    if (normalizedAction === "book") {
      let quoteId = order.delivery_quote_id;
      let quoteSummary = null;
      let quoteResponse = order.delivery_provider_payload || null;
      if (!quoteId) {
        const quote = await createQuote(admin, order, store);
        quoteId = quote.summary.quoteId;
        quoteSummary = quote.summary;
        quoteResponse = quote.response;
      }

      const payload = buildLalamoveOrderPayload({
        order: { ...order, delivery_quote_id: quoteId },
        store,
        quotationId: quoteId,
        quotationResponse: quoteResponse,
      });
      const response = await lalamoveRequest("POST", "/v3/orders", payload);
      const summary = parseOrderSummary(response);
      if (!summary.orderId) throw new Error("Lalamove order response did not include an order ID.");

      await saveDeliveryState(admin, order.id, {
        delivery_status: summary.status || "booked",
        delivery_order_id: summary.orderId,
        delivery_share_link: summary.shareLink,
        delivery_tracking_link: summary.trackingLink,
        delivery_provider_payload: response,
        delivery_last_error: null,
        delivery_booked_at: new Date().toISOString(),
      });

      return Response.json({ success: true, action: "book", summary: { ...summary, quote: quoteSummary }, raw: response });
    }

    if (normalizedAction === "status") {
      if (!order.delivery_order_id) throw new Error("No Lalamove order has been booked for this web order yet.");
      const response = await lalamoveRequest("GET", `/v3/orders/${encodeURIComponent(order.delivery_order_id)}`);
      const summary = parseOrderSummary(response);
      await saveDeliveryState(admin, order.id, {
        delivery_status: summary.status || order.delivery_status || "booked",
        delivery_share_link: summary.shareLink || order.delivery_share_link,
        delivery_tracking_link: summary.trackingLink || order.delivery_tracking_link,
        delivery_provider_payload: response,
        delivery_last_error: null,
      });
      return Response.json({ success: true, action: "status", summary, raw: response });
    }

    if (normalizedAction === "cancel") {
      if (!order.delivery_order_id) throw new Error("No Lalamove order has been booked for this web order yet.");
      const response = await lalamoveRequest("DELETE", `/v3/orders/${encodeURIComponent(order.delivery_order_id)}`);
      await saveDeliveryState(admin, order.id, {
        delivery_status: "cancelled",
        delivery_provider_payload: response,
        delivery_last_error: null,
        delivery_cancelled_at: new Date().toISOString(),
      });
      return Response.json({ success: true, action: "cancel", raw: response });
    }

    return Response.json({ error: "Unsupported Lalamove action." }, { status: 400 });
  } catch (error) {
    const webOrderId = body?.webOrderId;
    if (webOrderId) {
      await saveDeliveryState(admin, webOrderId, {
        delivery_last_error: error?.message || "Lalamove request failed.",
      }).catch(() => {});
    }
    return Response.json(
      {
        error: error?.message || "Lalamove request failed.",
        details: error?.payload || null,
      },
      { status: error?.status || 500 }
    );
  }
}
