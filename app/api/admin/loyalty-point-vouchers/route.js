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
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        );
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (!error && data?.user) return data.user;

  const headerStore = await headers();
  const token = String(headerStore.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
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
      return Response.json(
        { error: "Supabase service role key is required for voucher allocation." },
        { status: 500 }
      );
    }

    const admin = createSupabaseClient(url, serviceRoleKey);
    const guard = await requireAdmin(admin);
    if (!guard.allowed) {
      return Response.json({ error: guard.error }, { status: guard.status });
    }

    const { memberId } = await req.json();
    if (!memberId) {
      return Response.json({ error: "Loyalty member is required." }, { status: 400 });
    }

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

    return Response.json({
      success: true,
      pointVouchersCreated: pointResult.created || 0,
      welcomeVoucherCreated: welcomeResult.created || 0,
      warnings,
    });
  } catch (error) {
    return Response.json(
      { error: error?.message || "Unable to allocate point vouchers." },
      { status: 500 }
    );
  }
}
