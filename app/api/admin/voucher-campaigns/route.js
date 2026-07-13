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

async function createAdminClient() {
  const { url, serviceRoleKey } = supabaseConfig();
  if (!url || !serviceRoleKey) {
    return { error: "Supabase service role key is required for voucher campaigns." };
  }
  return { admin: createSupabaseClient(url, serviceRoleKey) };
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

function manilaDateTime(value, endOfDay = false) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) return new Date(text).toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return `${text}T${endOfDay ? "23:59:59" : "00:00:00"}+08:00`;
  }
  return new Date(text).toISOString();
}

function normalizeCampaignPayload(payload = {}) {
  const code = String(payload.code || "").trim().toUpperCase();
  const title = String(payload.title || "").trim();
  const rewardText = String(payload.reward_text || payload.rewardText || "").trim();
  if (!code) throw new Error("Campaign code is required.");
  if (!title) throw new Error("Campaign title is required.");
  if (!rewardText) throw new Error("Reward text is required.");

  return {
    code,
    title,
    reward_text: rewardText,
    reward_type: String(payload.reward_type || payload.rewardType || "welcome").trim().toLowerCase() || "welcome",
    voucher_prefix: String(payload.voucher_prefix || payload.voucherPrefix || code.split("-")[0] || "VOUCHER")
      .trim()
      .toUpperCase(),
    validity_days: Math.max(1, Number.parseInt(payload.validity_days || payload.validityDays || 15, 10) || 15),
    starts_at: manilaDateTime(payload.starts_at || payload.startsAt || payload.start_date || payload.startDate),
    ends_at: manilaDateTime(payload.ends_at || payload.endsAt || payload.end_date || payload.endDate, true),
    is_active: payload.is_active ?? payload.isActive ?? true,
    auto_create_on_signup: Boolean(payload.auto_create_on_signup ?? payload.autoCreateOnSignup ?? false),
    auto_create_on_link: Boolean(payload.auto_create_on_link ?? payload.autoCreateOnLink ?? false),
  };
}

async function guardedAdmin() {
  const { admin, error } = await createAdminClient();
  if (error) return { response: Response.json({ error }, { status: 500 }) };
  const guard = await requireAdmin(admin);
  if (!guard.allowed) return { response: Response.json({ error: guard.error }, { status: guard.status }) };
  return { admin };
}

export async function GET() {
  try {
    const { admin, response } = await guardedAdmin();
    if (response) return response;

    const { data, error } = await admin
      .from("voucher_campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return Response.json({ rows: data || [] });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to load voucher campaigns." }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { admin, response } = await guardedAdmin();
    if (response) return response;

    const payload = normalizeCampaignPayload(await req.json());
    const { data, error } = await admin
      .from("voucher_campaigns")
      .insert(payload)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return Response.json({ success: true, campaign: data });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to create voucher campaign." }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const { admin, response } = await guardedAdmin();
    if (response) return response;

    const body = await req.json();
    const id = String(body?.id || "").trim();
    if (!id) return Response.json({ error: "Campaign ID is required." }, { status: 400 });

    const updatePayload = body.partial
      ? body.partial
      : normalizeCampaignPayload(body);

    if (Object.prototype.hasOwnProperty.call(updatePayload, "starts_at")) {
      updatePayload.starts_at = manilaDateTime(updatePayload.starts_at);
    }
    if (Object.prototype.hasOwnProperty.call(updatePayload, "ends_at")) {
      updatePayload.ends_at = manilaDateTime(updatePayload.ends_at, true);
    }

    const { data, error } = await admin
      .from("voucher_campaigns")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return Response.json({ success: true, campaign: data });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to update voucher campaign." }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const { admin, response } = await guardedAdmin();
    if (response) return response;

    const url = new URL(req.url);
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return Response.json({ error: "Campaign ID is required." }, { status: 400 });

    const { data, error } = await admin
      .from("voucher_campaigns")
      .update({ is_active: false })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return Response.json({ success: true, campaign: data });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to disable voucher campaign." }, { status: 500 });
  }
}
