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
          if (!profile || user.deleted_at) return null;
          return {
            id: user.id,
            email: user.email,
            contact_number: user.user_metadata?.contact_number || "",
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
      { accounts, can_manage_accounts: role === "super_admin" },
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
    if (!["confirm_customer", "edit"].includes(body?.action) || typeof body.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) {
      return Response.json({ error: "Select a valid customer account to confirm." }, { status: 400 });
    }
    const { data: profile, error: profileError } = await admin.from("profiles").select("role,full_name").eq("id", body.id).maybeSingle();
    if (profileError) throw profileError;
    if (body.action === "edit") {
      if (!profile) return Response.json({ error: "Account not found." }, { status: 404 });
      const { data: actor, error: actorError } = await admin.from("profiles").select("role").eq("id", requester.id).single();
      if (actorError) throw actorError;
      if (actor.role !== "super_admin") return Response.json({ error: "Super Admin access required." }, { status: 403 });
      const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const contact = typeof body.contact_number === "string" ? body.contact_number.trim() : "";
      if (!fullName || fullName.length > 150 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || contact.length > 40 || (contact && !/^[+\d\s().-]+$/.test(contact))) {
        return Response.json({ error: "Enter a valid name, email, and contact number." }, { status: 400 });
      }
      const { data: current, error: lookupError } = await admin.auth.admin.getUserById(body.id);
      if (lookupError) throw lookupError;
      if (!current?.user || current.user.deleted_at) return Response.json({ error: "Account not found." }, { status: 404 });
      const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(body.id, {
        email, user_metadata: { ...current.user.user_metadata, full_name: fullName, contact_number: contact },
      });
      if (updateError) throw updateError;
      clearCached("admin:accounts:list");
      const { data: saved, error: saveError } = await admin.from("profiles").update({ full_name: fullName }).eq("id", body.id).select("full_name").single();
      if (saveError) throw new Error("Email and contact saved, but the profile name could not be saved. Refresh and retry.");
      if (updated.user?.email !== email || saved.full_name !== fullName || updated.user?.user_metadata?.contact_number !== contact) throw new Error("Account changes could not be verified. Refresh and retry.");
      return Response.json({ account: { id: body.id, full_name: saved.full_name, email: updated.user.email, contact_number: contact } }, { headers: { "Cache-Control": "private, no-store" } });
    }
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

export async function DELETE(request) {
  try {
    const { admin, user, response } = await requireAdminApi();
    if (response) return response;
    const body = await request.json().catch(() => null);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body?.id || "")) return Response.json({ error: "Select a valid account." }, { status: 400 });
    if (body.id === user.id) return Response.json({ error: "You cannot delete your own account." }, { status: 400 });
    const { data: profiles, error: profileError } = await admin.from("profiles").select("id,role").in("id", [user.id, body.id]);
    if (profileError) throw profileError;
    const target = profiles.find((row) => row.id === body.id);
    const actor = profiles.find((row) => row.id === user.id);
    if (actor?.role !== "super_admin") return Response.json({ error: "Super Admin access required." }, { status: 403 });
    if (!target) return Response.json({ error: "Account not found." }, { status: 404 });
    // Soft deletion disables sign-in while retaining IDs referenced by historical records.
    const { error } = await admin.auth.admin.deleteUser(body.id, true);
    if (error) throw error;
    clearCached("admin:accounts:list");
    return Response.json({ deleted: body.id }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to delete account." }, { status: 500 });
  }
}
