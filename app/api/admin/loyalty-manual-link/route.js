import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { createMissingPointRewardVouchers } from "@/lib/loyalty/pointVouchers";
import { createWelcomeVoucherIfNeeded } from "@/lib/loyalty/welcomeVoucher";

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

async function requireAdmin(adminClient) {
  const requester = await getRequesterUser();
  if (!requester?.id) return { allowed: false, error: "Admin login is required.", status: 401 };

  const { data: profile, error } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", requester.id)
    .maybeSingle();

  if (error) return { allowed: false, error: error.message, status: 500 };

  const role = String(profile?.role || "").toLowerCase();
  if (!["admin", "super_admin"].includes(role)) {
    return { allowed: false, error: "Admin access required.", status: 403 };
  }

  return { allowed: true, requester };
}

async function createAdminClient() {
  const { url, serviceRoleKey } = supabaseConfig();
  if (!url || !serviceRoleKey) {
    return { error: "Supabase service role key is required for manual loyalty linking." };
  }
  return { admin: createSupabaseClient(url, serviceRoleKey) };
}

async function allocateLinkVouchers(admin, memberId) {
  let pointResult = { created: 0 };
  let welcomeResult = { created: 0 };
  const warnings = [];

  try {
    pointResult = await createMissingPointRewardVouchers(admin, memberId);
  } catch (error) {
    warnings.push(`Point voucher allocation skipped: ${error?.message || "Unknown error"}`);
  }

  try {
    welcomeResult = await createWelcomeVoucherIfNeeded(admin, memberId);
  } catch (error) {
    warnings.push(`Welcome voucher allocation skipped: ${error?.message || "Unknown error"}`);
  }

  return {
    pointVouchersCreated: pointResult.created || 0,
    welcomeVoucherCreated: welcomeResult.created || 0,
    warnings,
  };
}

function matchesQuery(values, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return values.some((value) => String(value || "").toLowerCase().includes(q));
}

export async function GET(req) {
  try {
    const { admin, error: configError } = await createAdminClient();
    if (configError) return Response.json({ error: configError }, { status: 500 });

    const guard = await requireAdmin(admin);
    if (!guard.allowed) return Response.json({ error: guard.error }, { status: guard.status });

    const url = new URL(req.url);
    const type = String(url.searchParams.get("type") || "").toLowerCase();
    const query = String(url.searchParams.get("q") || "").trim();

    if (query.length < 2) return Response.json({ rows: [] });

    if (type === "users") {
      const [{ data: usersData, error: usersError }, { data: profiles, error: profilesError }] =
        await Promise.all([
          admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
          admin.from("profiles").select("id,email,full_name,role,loyalty_account_id"),
        ]);

      if (usersError) throw usersError;
      if (profilesError) throw profilesError;

      const profileById = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile]));
      const rows = (usersData?.users || [])
        .map((user) => {
          const profile = profileById[user.id] || {};
          const role = String(profile.role || user.user_metadata?.role || "customer").toLowerCase();
          if (["admin", "super_admin", "cashier", "kds"].includes(role)) return null;
          const fullName = profile.full_name || user.user_metadata?.full_name || user.email || "";
          const email = profile.email || user.email || "";
          if (!matchesQuery([fullName, email], query)) return null;
          return {
            id: user.id,
            email,
            full_name: fullName,
            role,
            loyalty_account_id: profile.loyalty_account_id || "",
            created_at: user.created_at || profile.created_at || "",
          };
        })
        .filter(Boolean)
        .sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email)))
        .slice(0, 12);

      return Response.json({ rows });
    }

    if (type === "members") {
      const { data, error } = await admin
        .from("loyalty_members")
        .select("id,user_id,customer_name,customer_code,Email,Phone,City,Note")
        .or(`customer_name.ilike.%${query}%,customer_code.ilike.%${query}%,Phone.ilike.%${query}%`)
        .limit(12);

      if (error) throw error;
      return Response.json({ rows: data || [] });
    }

    return Response.json({ error: "Invalid manual link search type." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to search loyalty link records." }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { admin, error: configError } = await createAdminClient();
    if (configError) return Response.json({ error: configError }, { status: 500 });

    const guard = await requireAdmin(admin);
    if (!guard.allowed) return Response.json({ error: guard.error }, { status: guard.status });

    const { userId, memberId } = await req.json();
    if (!userId || !memberId) {
      return Response.json({ error: "Registered user and loyalty member are required." }, { status: 400 });
    }

    const { data: authUserData, error: authUserError } = await admin.auth.admin.getUserById(userId);
    if (authUserError) throw authUserError;
    const authUser = authUserData?.user;
    if (!authUser?.id) return Response.json({ error: "Registered user account was not found." }, { status: 404 });

    const { data: memberRow, error: memberError } = await admin
      .from("loyalty_members")
      .select("id,user_id,customer_name,customer_code,Email")
      .eq("id", memberId)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!memberRow?.id) return Response.json({ error: "Selected loyalty member was not found." }, { status: 404 });

    const { data: profileRow, error: profileError } = await admin
      .from("profiles")
      .select("id,email,full_name,role,loyalty_account_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) throw profileError;
    const role = String(profileRow?.role || "customer").toLowerCase();
    if (["admin", "super_admin", "cashier", "kds"].includes(role)) {
      return Response.json({ error: "Only customer accounts can be linked to loyalty members." }, { status: 400 });
    }

    if (String(memberRow.user_id || "") === String(userId)) {
      const voucherAllocation = await allocateLinkVouchers(admin, memberId);
      return Response.json({ success: true, alreadyLinked: true, ...voucherAllocation });
    }

    if (memberRow.user_id) {
      return Response.json({ error: "This loyalty member is already linked. Unlink first." }, { status: 409 });
    }

    const { data: existingMemberForUser, error: existingMemberError } = await admin
      .from("loyalty_members")
      .select("id,customer_name,customer_code")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingMemberError) throw existingMemberError;
    if (String(existingMemberForUser?.id || "") === String(memberId)) {
      const voucherAllocation = await allocateLinkVouchers(admin, memberId);
      return Response.json({ success: true, alreadyLinked: true, ...voucherAllocation });
    }
    if (existingMemberForUser?.id) {
      return Response.json({
        error: `This user is already linked to ${existingMemberForUser.customer_name || "another loyalty member"} (${existingMemberForUser.customer_code || existingMemberForUser.id}). Unlink first.`,
      }, { status: 409 });
    }

    if (String(profileRow?.loyalty_account_id || "") === String(memberId)) {
      const { error: syncMemberError } = await admin
        .from("loyalty_members")
        .update({ user_id: userId })
        .eq("id", memberId)
        .is("user_id", null);
      if (syncMemberError) throw syncMemberError;
      const voucherAllocation = await allocateLinkVouchers(admin, memberId);
      return Response.json({ success: true, alreadyLinked: true, ...voucherAllocation });
    }

    if (profileRow?.loyalty_account_id) {
      return Response.json({
        error: `This user already has loyalty_account_id = ${profileRow.loyalty_account_id}. Unlink first.`,
      }, { status: 409 });
    }

    if (!profileRow?.id) {
      const { error: createProfileError } = await admin
        .from("profiles")
        .upsert({
          id: userId,
          email: authUser.email || memberRow.Email || null,
          full_name: authUser.user_metadata?.full_name || memberRow.customer_name || authUser.email || null,
          role: "customer",
          loyalty_account_id: memberId,
          is_active: true,
        }, { onConflict: "id" });

      if (createProfileError) throw createProfileError;
    } else {
      const { error: profileLinkError } = await admin
        .from("profiles")
        .update({ loyalty_account_id: memberId })
        .eq("id", userId);

      if (profileLinkError) throw profileLinkError;
    }

    const { error: memberLinkError } = await admin
      .from("loyalty_members")
      .update({ user_id: userId })
      .eq("id", memberId)
      .is("user_id", null);

    if (memberLinkError) {
      await admin.from("profiles").update({ loyalty_account_id: null }).eq("id", userId);
      throw memberLinkError;
    }

    const { data: linkedMember, error: linkedMemberError } = await admin
      .from("loyalty_members")
      .select("id,user_id")
      .eq("id", memberId)
      .maybeSingle();

    if (linkedMemberError) throw linkedMemberError;
    if (String(linkedMember?.user_id || "") !== String(userId)) {
      await admin.from("profiles").update({ loyalty_account_id: null }).eq("id", userId);
      return Response.json({ error: "This loyalty member was linked by another account. Refresh and try again." }, { status: 409 });
    }

    await admin
      .from("loyalty_link_requests")
      .update({
        status: "approved",
        matched_member_id: memberId,
        approved_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("status", "pending");

    const voucherAllocation = await allocateLinkVouchers(admin, memberId);

    return Response.json({ success: true, ...voucherAllocation });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to link loyalty member." }, { status: 500 });
  }
}
