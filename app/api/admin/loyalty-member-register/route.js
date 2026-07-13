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

  return { allowed: true };
}

function manilaDateISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function normalizeBirthday(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return text;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthIndex = Number(iso[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return text;
  return `${iso[1]}-${monthNames[monthIndex]}-${iso[3]}`;
}

function numberValue(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export async function POST(req) {
  try {
    const { url, serviceRoleKey } = supabaseConfig();
    if (!url || !serviceRoleKey) {
      return Response.json({ error: "Supabase service role key is required for loyalty registration." }, { status: 500 });
    }

    const admin = createSupabaseClient(url, serviceRoleKey);
    const guard = await requireAdmin(admin);
    if (!guard.allowed) {
      return Response.json({ error: guard.error }, { status: guard.status });
    }

    const payload = await req.json();
    const firstName = String(payload?.first_name || payload?.firstName || "").trim();
    const lastName = String(payload?.last_name || payload?.lastName || "").trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || String(payload?.customer_name || "").trim();
    const phone = String(payload?.Phone || "").trim();
    const email = String(payload?.Email || "").trim();
    const city = String(payload?.City || "").trim();
    const birthday = normalizeBirthday(payload?.birthday || payload?.Note);
    const pointsBalance = Math.max(0, numberValue(payload?.["Points balance"]));
    const availablePoints = Math.max(0, numberValue(payload?.["Available points"] ?? payload?.["Points balance"]));
    const totalVisits = Math.max(0, numberValue(payload?.["Total visits"]));
    const totalSpent = Math.max(0, numberValue(payload?.["Total spent"]));

    if (!firstName || !lastName) return Response.json({ error: "First name and last name are required." }, { status: 400 });
    if (!fullName) return Response.json({ error: "Full name is required." }, { status: 400 });
    if (!phone) return Response.json({ error: "Phone number is required." }, { status: 400 });
    if (!birthday) return Response.json({ error: "Birthday is required." }, { status: 400 });

    const today = manilaDateISO();
    const insertPayload = {
      customer_name: fullName,
      Email: email || null,
      Phone: phone,
      City: city || null,
      "Points balance": pointsBalance,
      "Available points": availablePoints,
      "Total visits": totalVisits,
      "Total spent": totalSpent,
      "First visit": today,
      "Last visit": today,
      Note: birthday,
    };

    const { data: created, error: insertError } = await admin
      .from("loyalty_members")
      .insert(insertPayload)
      .select("*")
      .maybeSingle();

    if (insertError) throw insertError;
    if (!created?.id) return Response.json({ error: "Loyalty member was not created." }, { status: 409 });

    let pointVouchersCreated = 0;
    let welcomeVoucherCreated = 0;
    let voucherWarning = "";
    if (availablePoints >= 100) {
      try {
        const voucherResult = await createMissingPointRewardVouchers(admin, created.id);
        pointVouchersCreated = Number(voucherResult?.created || 0);
      } catch (voucherError) {
        voucherWarning = voucherError?.message || "Point voucher allocation skipped.";
      }
    }

    try {
      const welcomeResult = await createWelcomeVoucherIfNeeded(admin, created.id);
      welcomeVoucherCreated = Number(welcomeResult?.created || 0);
    } catch (welcomeError) {
      voucherWarning = [voucherWarning, welcomeError?.message || "Welcome voucher allocation skipped."]
        .filter(Boolean)
        .join(" ");
    }

    const { data: member, error: memberError } = await admin
      .from("loyalty_members")
      .select("*")
      .eq("id", created.id)
      .maybeSingle();

    if (memberError) throw memberError;

    return Response.json({
      success: true,
      member: member || created,
      pointVouchersCreated,
      welcomeVoucherCreated,
      voucherWarning,
    });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to register loyalty member." }, { status: 500 });
  }
}
