import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

function getSupabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function getRequesterUser() {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return null;

  const cookieStore = await cookies();
  const cookieClient = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });

  const { data, error } = await cookieClient.auth.getUser();
  if (!error && data?.user) return data.user;

  const headerStore = await headers();
  const token = String(headerStore.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const tokenClient = createSupabaseClient(url, anonKey);
  const { data: tokenData, error: tokenError } = await tokenClient.auth.getUser(token);
  if (tokenError || !tokenData?.user) return null;
  return tokenData.user;
}

async function requirePosUser(adminClient) {
  const requester = await getRequesterUser();
  if (!requester?.id) return { allowed: false, status: 401, error: "POS login is required." };

  const { data: profile, error } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", requester.id)
    .maybeSingle();

  if (error) return { allowed: false, status: 500, error: error.message };

  const role = String(profile?.role || "").toLowerCase();
  if (!["cashier", "admin", "super_admin"].includes(role)) {
    return { allowed: false, status: 403, error: "POS access is required." };
  }

  return { allowed: true, user: requester };
}

export async function POST(req) {
  try {
    const { url, serviceRoleKey } = getSupabaseConfig();
    if (!url || !serviceRoleKey) {
      return Response.json({ error: "Supabase service role key is required for voucher redemption." }, { status: 500 });
    }

    const admin = createSupabaseClient(url, serviceRoleKey);
    const guard = await requirePosUser(admin);
    if (!guard.allowed) return Response.json({ error: guard.error }, { status: guard.status });

    const { voucherId } = await req.json();
    if (!voucherId) return Response.json({ error: "Voucher ID is required." }, { status: 400 });

    const { data: currentVoucher, error: lookupError } = await admin
      .from("vouchers")
      .select("id, code, status, expires_at, redeemed_at")
      .eq("id", voucherId)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!currentVoucher?.id) return Response.json({ error: "Voucher was not found." }, { status: 404 });

    const status = String(currentVoucher.status || "active").toLowerCase();
    const expiryMs = currentVoucher.expires_at ? new Date(currentVoucher.expires_at).getTime() : 0;
    const usable =
      ["active", "available"].includes(status) &&
      !currentVoucher.redeemed_at &&
      (!expiryMs || expiryMs > Date.now());

    if (!usable) {
      return Response.json({ error: "Voucher is no longer active or was already used." }, { status: 409 });
    }

    const { data: redeemedVoucher, error: redeemError } = await admin
      .from("vouchers")
      .update({ status: "redeemed", redeemed_at: new Date().toISOString() })
      .eq("id", voucherId)
      .in("status", ["active", "available"])
      .is("redeemed_at", null)
      .select("id, code, status, redeemed_at")
      .maybeSingle();

    if (redeemError) throw redeemError;
    if (!redeemedVoucher?.id) {
      return Response.json({ error: "Voucher is no longer active or was already used." }, { status: 409 });
    }

    return Response.json({ success: true, voucher: redeemedVoucher });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to redeem voucher." }, { status: 500 });
  }
}
