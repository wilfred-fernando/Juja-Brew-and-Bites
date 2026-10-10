import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { drainCustomerOrderPush } from "@/lib/push/orderPushOutbox";

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
  if (!["cashier", "admin", "super_admin", "kds"].includes(role)) {
    return { allowed: false, error: "Staff access required.", status: 403 };
  }

  return { allowed: true };
}

export async function POST(req) {
  try {
    const { url, serviceRoleKey } = supabaseConfig();
    if (!url || !serviceRoleKey) {
      return Response.json({ error: "Supabase service role key is required." }, { status: 500 });
    }

    const admin = createSupabaseClient(url, serviceRoleKey, { auth: { persistSession: false } });
    const guard = await requireStaff(admin);
    if (!guard.allowed) return Response.json({ error: guard.error }, { status: guard.status });

    const { webOrderId } = await req.json();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(webOrderId || ""))) {
      return Response.json({ error: "Valid web order ID is required." }, { status: 400 });
    }
    const results = await drainCustomerOrderPush(webOrderId);
    return Response.json({ success: true, results });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to send customer push notification." }, { status: 500 });
  }
}
