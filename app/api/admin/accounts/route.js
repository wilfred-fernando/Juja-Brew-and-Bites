import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

async function getRequesterRole() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );

  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return "";

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", uid)
    .maybeSingle();

  return String(profile?.role || "").toLowerCase();
}

export async function GET() {
  try {
    const role = await getRequesterRole();
    if (!["admin", "super_admin"].includes(role)) {
      return Response.json({ error: "Admin access required." }, { status: 403 });
    }

    const admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const [{ data: usersData, error: usersError }, { data: profiles, error: profilesError }, { data: stores }] =
      await Promise.all([
        admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        admin
          .from("profiles")
          .select("id, full_name, display_name, role, store_id, created_at")
          .in("role", ["admin", "super_admin", "cashier", "cashier_disabled"]),
        admin.from("stores").select("id, name"),
      ]);

    if (usersError) throw usersError;
    if (profilesError) throw profilesError;

    const profileById = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile]));
    const storeById = Object.fromEntries((stores || []).map((store) => [String(store.id), store.name]));

    const accounts = (usersData?.users || [])
      .map((user) => {
        const profile = profileById[user.id];
        if (!profile) return null;
        return {
          id: user.id,
          email: user.email,
          full_name: profile.full_name,
          display_name: profile.display_name || user.user_metadata?.display_name || user.user_metadata?.full_name,
          role: profile.role,
          store_id: profile.store_id,
          store_name: profile.store_id ? storeById[String(profile.store_id)] : "",
          created_at: user.created_at || profile.created_at,
          last_sign_in_at: user.last_sign_in_at,
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.full_name || a.email || "").localeCompare(String(b.full_name || b.email || "")));

    return Response.json({ accounts });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to load accounts." }, { status: 500 });
  }
}
