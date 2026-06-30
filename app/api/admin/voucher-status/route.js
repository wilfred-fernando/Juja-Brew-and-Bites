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

  return { allowed: true };
}

export async function POST(req) {
  try {
    const { url, serviceRoleKey } = supabaseConfig();
    if (!url || !serviceRoleKey) {
      return Response.json({ error: "Supabase service role key is required for voucher status changes." }, { status: 500 });
    }

    const admin = createSupabaseClient(url, serviceRoleKey);
    const guard = await requireAdmin(admin);
    if (!guard.allowed) {
      return Response.json({ error: guard.error }, { status: guard.status });
    }

    const { voucherId, status } = await req.json();
    const requestedStatus = String(status || "").toLowerCase();
    const dbStatus = requestedStatus === "available" ? "active" : requestedStatus;

    if (!voucherId) return Response.json({ error: "Voucher ID is required." }, { status: 400 });
    if (!["active", "redeemed", "expired"].includes(dbStatus)) {
      return Response.json({ error: "Invalid voucher status." }, { status: 400 });
    }

    const { data: currentVoucher, error: currentError } = await admin
      .from("vouchers")
      .select("id, expires_at")
      .eq("id", voucherId)
      .maybeSingle();

    if (currentError) throw currentError;
    if (!currentVoucher?.id) return Response.json({ error: "Voucher was not found." }, { status: 404 });

    const nowIso = new Date().toISOString();
    const nextExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const updatePayload = {
      status: dbStatus,
      redeemed_at: dbStatus === "redeemed" ? nowIso : null,
    };

    if (dbStatus === "active") {
      const expiryMs = currentVoucher.expires_at ? new Date(currentVoucher.expires_at).getTime() : 0;
      if (!expiryMs || expiryMs < Date.now()) updatePayload.expires_at = nextExpiry;
    }

    const { data, error } = await admin
      .from("vouchers")
      .update(updatePayload)
      .eq("id", voucherId)
      .select("id, member_id, code, reward_text, reward_type, status, issued_at, expires_at, redeemed_at")
      .maybeSingle();

    if (error) throw error;
    if (!data?.id) return Response.json({ error: "Voucher status was not updated." }, { status: 409 });

    return Response.json({ success: true, voucher: data });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to update voucher status." }, { status: 500 });
  }
}
