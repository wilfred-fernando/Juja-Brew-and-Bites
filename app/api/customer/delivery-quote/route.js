import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import {
  buildLalamoveQuotePayload,
  getLalamoveConfig,
  lalamoveRequest,
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

async function getCustomerUser() {
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

export async function POST(req) {
  const { url, serviceRoleKey } = supabaseConfig();
  if (!url || !serviceRoleKey) {
    return Response.json({ error: "Delivery quote service is not configured." }, { status: 500 });
  }

  const user = await getCustomerUser();
  if (!user?.id) {
    return Response.json({ error: "Customer login is required." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const storeId = String(body?.storeId || "").trim();
    const deliveryAddress = String(body?.deliveryAddress || "").trim();
    if (!storeId) return Response.json({ error: "Store is required." }, { status: 400 });
    if (deliveryAddress.length < 8) return Response.json({ error: "Complete delivery address is required." }, { status: 400 });

    const config = getLalamoveConfig();
    if (!config.configured) {
      return Response.json({
        success: false,
        configured: false,
        error: "Lalamove is not configured yet.",
      });
    }

    const admin = createSupabaseClient(url, serviceRoleKey, { auth: { persistSession: false } });
    const { data: store, error: storeError } = await admin
      .from("stores")
      .select("*")
      .eq("id", storeId)
      .maybeSingle();

    if (storeError) throw new Error(storeError.message);
    if (!store) return Response.json({ error: "Store pickup details were not found." }, { status: 404 });

    const quoteOrder = {
      delivery_address: deliveryAddress,
      delivery_latitude: body?.deliveryLatitude,
      delivery_longitude: body?.deliveryLongitude,
      customer_name: body?.customerName || user?.user_metadata?.full_name || "Web Customer",
      customer_contact: body?.customerContact || "",
      total: Number(body?.subtotal || 0),
    };

    const payload = buildLalamoveQuotePayload({ order: quoteOrder, store });
    const raw = await lalamoveRequest("POST", "/v3/quotations", payload);
    const summary = parseQuoteSummary(raw);

    return Response.json({
      success: true,
      summary: {
        ...summary,
        fee: Number(summary.fee || 0),
        currency: summary.currency || "PHP",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error?.message || "Delivery quote failed.",
        details: error?.payload || null,
      },
      { status: error?.status || 500 }
    );
  }
}
