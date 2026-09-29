import { createClient } from "@supabase/supabase-js";
import { requesterUser } from "@/lib/server/admin-api";

async function bookingStaff() {
  const user = await requesterUser();
  if (!user) return { response: Response.json({ error: "Staff login required." }, { status: 401 }) };
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (error || !["admin", "super_admin", "cashier"].includes(String(data?.role).toLowerCase())) return { response: Response.json({ error: "Staff access required." }, { status: 403 }) };
  return { admin };
}

export async function GET(request) {
  try {
    const { admin, response } = await bookingStaff();
    if (response) return response;
    const q = (new URL(request.url).searchParams.get("q") || "").trim().replace(/[^\p{L}\p{N}@ .+_-]/gu, "").slice(0, 80);
    if (q.length < 2) return Response.json({ customers: [] });
    const { data, error } = await admin.from("loyalty_members").select('id,user_id,customer_name,"Email","Phone"')
      .or(`customer_name.ilike.%${q}%,Email.ilike.%${q}%,Phone.ilike.%${q}%`).order("customer_name").limit(15);
    if (error) throw error;
    const ids = (data || []).map((row) => row.id);
    const linked = ids.length ? await admin.from("profiles").select("id,loyalty_account_id").in("loyalty_account_id", ids) : { data: [] };
    if (linked.error) throw linked.error;
    return Response.json({ customers: (data || []).map((row) => ({ id: row.id, user_id: row.user_id || linked.data?.find((p) => p.loyalty_account_id === row.id)?.id, name: row.customer_name, email: row.Email, phone: row.Phone })).filter((row) => row.user_id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error.message || "Customer search failed." }, { status: 500 }); }
}
