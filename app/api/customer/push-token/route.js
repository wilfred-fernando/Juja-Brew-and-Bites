import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

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

export async function POST(req) {
  try {
    const user = await getRequesterUser();
    if (!user?.id) {
      return Response.json({ error: "Customer login is required." }, { status: 401 });
    }

    const { url, serviceRoleKey } = supabaseConfig();
    if (!url || !serviceRoleKey) {
      return Response.json({ error: "Supabase service role key is required." }, { status: 500 });
    }

    const { token, platform = "native", app = "customer", deviceId = null } = await req.json();
    const pushToken = String(token || "").trim();
    if (!pushToken) {
      return Response.json({ error: "Push token is required." }, { status: 400 });
    }

    const admin = createSupabaseClient(url, serviceRoleKey, { auth: { persistSession: false } });
    const { error } = await admin
      .from("customer_push_tokens")
      .upsert(
        {
          user_id: user.id,
          token: pushToken,
          platform,
          app,
          device_id: deviceId,
          enabled: true,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "token" }
      );

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to save push token." }, { status: 500 });
  }
}
