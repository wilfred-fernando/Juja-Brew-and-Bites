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
    const { data: profiles, error } = await admin.from("profiles").select("id,full_name").eq("role", "customer");
    if (error) throw error;
    const profileMap = new Map((profiles || []).map((row) => [row.id, row]));
    const customers = [];
    for (let page = 1; ; page += 1) {
      const { data, error: authError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (authError) throw authError;
      for (const user of data.users) {
        const profile = profileMap.get(user.id);
        if (!profile || !user.email_confirmed_at) continue;
        const row = { id: user.id, user_id: user.id, member_id: null, name: profile.full_name || user.user_metadata?.full_name || user.email, email: user.email || "", phone: user.user_metadata?.contact_number || "" };
        if ([row.name, row.email, row.phone].some((value) => String(value).toLowerCase().includes(q.toLowerCase()))) customers.push(row);
      }
      if (data.users.length < 1000) break;
    }
    return Response.json({ customers: customers.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 15) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error.message || "Customer search failed." }, { status: 500 }); }
}
