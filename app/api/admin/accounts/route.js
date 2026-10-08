import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getCached, clearCached } from "@/lib/serverCache";
import { requireAdminApi } from "@/lib/server/admin-api";

const ACCOUNTS_TTL_MS = 60 * 1000;

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

    const accounts = await getCached("admin:accounts:list", ACCOUNTS_TTL_MS, async () => {
      const [{ data: usersData, error: usersError }, { data: profiles, error: profilesError }, { data: stores }] =
        await Promise.all([
          admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
          admin
            .from("profiles")
            .select("id, full_name, role, store_id, created_at"),
          admin.from("stores").select("id, name"),
        ]);

      if (usersError) throw usersError;
      if (profilesError) throw profilesError;

      const profileById = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile]));
      const storeById = Object.fromEntries((stores || []).map((store) => [String(store.id), store.name]));

      return (usersData?.users || [])
        .map((user) => {
          const profile = profileById[user.id];
          if (!profile) return null;
          return {
            id: user.id,
            email: user.email,
            full_name: profile.full_name,
            role: profile.role,
            store_id: profile.store_id,
            store_name: profile.store_id ? storeById[String(profile.store_id)] : "",
            created_at: user.created_at || profile.created_at,
            last_sign_in_at: user.last_sign_in_at,
            email_confirmed_at: user.email_confirmed_at || null,
            manual_confirmation: user.app_metadata?.manual_customer_confirmation || null,
          };
        })
        .filter(Boolean)
        .sort((a, b) => String(a.full_name || a.email || "").localeCompare(String(b.full_name || b.email || "")));
    });

    return Response.json(
      { accounts },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to load accounts." }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { admin, user: requester, response } = await requireAdminApi();
    if (response) return response;
    const body = await request.json().catch(() => null);
    if (body?.action !== "confirm_customer" || typeof body.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) {
      return Response.json({ error: "Select a valid customer account to confirm." }, { status: 400 });
    }
    const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id", body.id).maybeSingle();
    if (profileError) throw profileError;
    if (String(profile?.role || "").toLowerCase() !== "customer") {
      return Response.json({ error: "Manual confirmation is available only for customer accounts." }, { status: 403 });
    }
    const { data: current, error: lookupError } = await admin.auth.admin.getUserById(body.id);
    if (lookupError) throw lookupError;
    if (!current?.user?.email) return Response.json({ error: "This customer has no email address to confirm." }, { status: 400 });
    let confirmed = current.user;
    if (!confirmed.email_confirmed_at) {
      const { data, error } = await admin.auth.admin.updateUserById(body.id, {
        email_confirm: true,
        app_metadata: {
          ...confirmed.app_metadata,
          manual_customer_confirmation: { confirmed_by: requester.id, confirmed_at: new Date().toISOString() },
        },
      });
      if (error) throw error;
      confirmed = data?.user;
    }
    if (!confirmed?.email_confirmed_at) throw new Error("Email confirmation was not saved. Please retry.");
    clearCached("admin:accounts:list");
    return Response.json({ account: {
      id: confirmed.id,
      email_confirmed_at: confirmed.email_confirmed_at,
      manual_confirmation: confirmed.app_metadata?.manual_customer_confirmation || null,
    } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to confirm customer account." }, { status: 500 });
  }
}
