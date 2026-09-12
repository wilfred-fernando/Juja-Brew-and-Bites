import { createClient } from "@supabase/supabase-js";
import { requesterUser } from "@/lib/server/admin-api";
import { validateGcPurchase } from "@/lib/giftCertificatePurchase";

export const runtime = "nodejs";

async function context() {
  const user = await requesterUser();
  if (!user) return { response: Response.json({ error: "Please sign in to purchase e-GCs." }, { status: 401 }) };
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  return { user, admin };
}

export async function POST(req) {
  try {
    const { user, admin, response } = await context();
    if (response) return response;
    let input;
    try { input = validateGcPurchase(await req.json(), user.id, process.env.CLOUDFLARE_R2_PUBLIC_URL); }
    catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
    const { data, error } = await admin.rpc("create_gc_purchase", { p_data: input, p_actor: user.id });
    if (error) return Response.json({ error: error.code === "23505" ? "This payment proof has already been submitted." : error.message }, { status: 409 });
    return Response.json({ purchase: data }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Unable to submit the purchase. Retry with the same reference." }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    const { user, admin, response } = await context();
    if (response) return response;
    const params = new URL(req.url).searchParams;
    const storeId = params.get("storeId");
    let query = admin.from("gc_purchases").select("id,customer_name,customer_email,quantity,amount,status,source,store_id,payment_method,created_at,rejection_reason");
    if (storeId) {
      const { data: profile, error } = await admin.from("profiles").select("role,store_id").eq("id", user.id).single();
      if (error || !["admin", "super_admin", "cashier"].includes(profile?.role?.toLowerCase()) ||
        (profile.role.toLowerCase() === "cashier" && String(profile.store_id) !== storeId)) return Response.json({ error: "POS branch access required." }, { status: 403 });
      query = query.eq("source", "pos").eq("store_id", storeId);
      if (params.has("cashFrom")) {
        const from = params.get("cashFrom");
        if (!from || Number.isNaN(Date.parse(from))) return Response.json({ error: "Invalid shift start." }, { status: 400 });
        const { data: total, error: totalError } = await admin.rpc("gc_purchase_cash_total", { p_store_id: storeId, p_from: new Date(from).toISOString() });
        if (totalError) throw totalError;
        return Response.json({ cashCollected: Number(total) }, { headers: { "Cache-Control": "no-store" } });
      }
    } else query = query.eq("created_by", user.id);
    const from = params.get("from");
    if (from && !Number.isNaN(Date.parse(from))) query = query.gte("created_at", new Date(from).toISOString());
    const { data, error } = await query.order("created_at", { ascending: false }).limit(1000);
    if (error) throw error;
    return Response.json({ purchases: data }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Unable to load e-GC purchases." }, { status: 500 });
  }
}
