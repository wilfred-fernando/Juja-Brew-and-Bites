import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

function config() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function requesterUser() {
  const { url, anonKey } = config();
  if (!url || !anonKey) return null;
  const cookieStore = await cookies();
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  });
  const { data } = await client.auth.getUser();
  if (data?.user) return data.user;

  const headerStore = await headers();
  const token = String(headerStore.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const tokenClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: tokenData } = await tokenClient.auth.getUser(token);
  return tokenData?.user || null;
}

export async function requireAdminApi() {
  const { url, serviceRoleKey } = config();
  if (!url || !serviceRoleKey) {
    return { response: Response.json({ error: "Supabase server credentials are incomplete." }, { status: 500 }) };
  }
  const user = await requesterUser();
  if (!user?.id) return { response: Response.json({ error: "Admin login is required." }, { status: 401 }) };

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (error) return { response: Response.json({ error: error.message }, { status: 500 }) };
  if (!["admin", "super_admin"].includes(String(profile?.role || "").toLowerCase())) {
    return { response: Response.json({ error: "Admin access required." }, { status: 403 }) };
  }
  return { admin, user };
}

