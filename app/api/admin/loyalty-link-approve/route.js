import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { createMissingPointRewardVouchers } from "@/lib/loyalty/pointVouchers";

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

export async function POST(req) {
  try {
    const { url, serviceRoleKey } = supabaseConfig();
    if (!url || !serviceRoleKey) {
      return Response.json({ error: "Supabase service role key is required for approval." }, { status: 500 });
    }

    const admin = createSupabaseClient(url, serviceRoleKey);
    const guard = await requireAdmin(admin);
    if (!guard.allowed) {
      return Response.json({ error: guard.error }, { status: guard.status });
    }

    const { requestId, chosenMemberId } = await req.json();
    if (!requestId || !chosenMemberId) {
      return Response.json({ error: "Request ID and loyalty member are required." }, { status: 400 });
    }

    const { data: linkRequest, error: requestError } = await admin
      .from("loyalty_link_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError) throw requestError;
    if (!linkRequest?.id) {
      return Response.json({ error: "Link request was not found." }, { status: 404 });
    }
    if (!linkRequest.user_id) {
      return Response.json({ error: "Request has no customer user ID." }, { status: 400 });
    }

    const { data: memberRow, error: memberError } = await admin
      .from("loyalty_members")
      .select("id,user_id,customer_name,customer_code,Email")
      .eq("id", chosenMemberId)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!memberRow?.id) {
      return Response.json({ error: "Selected loyalty member was not found." }, { status: 404 });
    }
    if (memberRow.user_id) {
      return Response.json({ error: "This loyalty member is already linked. Unlink first." }, { status: 409 });
    }

    const { data: existingProfile, error: profileError } = await admin
      .from("profiles")
      .select("id,loyalty_account_id")
      .eq("id", linkRequest.user_id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (existingProfile?.loyalty_account_id) {
      return Response.json({
        error: `This user already has loyalty_account_id = ${existingProfile.loyalty_account_id}. Unlink first.`,
      }, { status: 409 });
    }

    if (!existingProfile?.id) {
      const { data: authUser } = await admin.auth.admin.getUserById(linkRequest.user_id);
      const profilePayload = {
        id: linkRequest.user_id,
        email: authUser?.user?.email || memberRow.Email || null,
        full_name: linkRequest.input_name || memberRow.customer_name || authUser?.user?.user_metadata?.full_name || null,
        role: "customer",
        loyalty_account_id: chosenMemberId,
        is_active: true,
      };

      const { error: createProfileError } = await admin
        .from("profiles")
        .upsert(profilePayload, { onConflict: "id" });

      if (createProfileError) throw createProfileError;
    } else {
      const { error: profileLinkError } = await admin
        .from("profiles")
        .update({ loyalty_account_id: chosenMemberId })
        .eq("id", linkRequest.user_id);

      if (profileLinkError) throw profileLinkError;
    }

    const { error: memberLinkError } = await admin
      .from("loyalty_members")
      .update({ user_id: linkRequest.user_id })
      .eq("id", chosenMemberId);

    if (memberLinkError) {
      await admin.from("profiles").update({ loyalty_account_id: null }).eq("id", linkRequest.user_id);
      throw memberLinkError;
    }

    const { error: updateRequestError } = await admin
      .from("loyalty_link_requests")
      .update({
        status: "approved",
        matched_member_id: chosenMemberId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (updateRequestError) throw updateRequestError;

    const voucherResult = await createMissingPointRewardVouchers(admin, chosenMemberId);

    return Response.json({ success: true, pointVouchersCreated: voucherResult.created || 0 });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to approve loyalty link request." }, { status: 500 });
  }
}
