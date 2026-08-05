import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

export async function requireArchiveRole(allowedRoles = ["cashier", "admin", "super_admin"]) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { allowed: false, status: 500, error: "Supabase is not configured." };

  const cookieStore = await cookies();
  const cookieClient = createServerClient(url, anonKey, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  });
  let { data } = await cookieClient.auth.getUser();
  let user = data?.user || null;
  if (!user) {
    const headerStore = await headers();
    const token = String(headerStore.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (token) {
      const tokenClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const tokenResult = await tokenClient.auth.getUser(token);
      user = tokenResult.data?.user || null;
    }
  }
  if (!user?.id) return { allowed: false, status: 401, error: "Login is required." };

  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY || anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (error) return { allowed: false, status: 500, error: error.message };
  const role = String(profile?.role || "").toLowerCase();
  if (!allowedRoles.includes(role)) return { allowed: false, status: 403, error: "Archive access is not allowed." };
  return { allowed: true, user, profile, role };
}
