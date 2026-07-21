import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import {
  findLoyaltyMemberByPhoneBirthday,
  loyaltyDuplicatePayload,
  normalizeLoyaltyBirthday,
} from "@/lib/loyalty/registration";

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

export async function POST(req) {
  try {
    const { url, serviceRoleKey } = supabaseConfig();
    if (!url || !serviceRoleKey) {
      return Response.json({ error: "Supabase service role key is required for loyalty registration." }, { status: 500 });
    }

    const user = await getRequesterUser();
    if (!user?.id) return Response.json({ error: "Customer login is required." }, { status: 401 });

    const payload = await req.json();
    const firstName = String(payload?.first_name || payload?.firstName || "").trim();
    const lastName = String(payload?.last_name || payload?.lastName || "").trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const phone = String(payload?.Phone || payload?.phone || "").trim();
    const city = String(payload?.City || payload?.city || "").trim();
    const birthday = normalizeLoyaltyBirthday(payload?.birthday || payload?.Note);

    if (!firstName || !lastName) return Response.json({ error: "First name and last name are required." }, { status: 400 });
    if (!phone) return Response.json({ error: "Phone number is required." }, { status: 400 });
    if (!city) return Response.json({ error: "City location is required." }, { status: 400 });
    if (!birthday) return Response.json({ error: "Birthday is required." }, { status: 400 });

    const admin = createSupabaseClient(url, serviceRoleKey);

    const { data: alreadyLinked, error: linkedError } = await admin
      .from("loyalty_members")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (linkedError) throw linkedError;
    if (alreadyLinked?.id) {
      return Response.json({ success: true, member: alreadyLinked, alreadyLinked: true });
    }

    const duplicate = await findLoyaltyMemberByPhoneBirthday(admin, phone, birthday);
    if (duplicate?.id) {
      return Response.json({
        error: "A registered loyalty account already exists with the same contact number and birthday.",
        duplicateMatch: true,
        existingMember: loyaltyDuplicatePayload(duplicate),
      }, { status: 409 });
    }

    const today = manilaDateISO();
    const { data: created, error: insertError } = await admin
      .from("loyalty_members")
      .insert({
        user_id: user.id,
        customer_name: fullName,
        Email: user.email || null,
        Phone: phone,
        City: city,
        "Points balance": 0,
        "Available points": 0,
        "Total visits": 0,
        "Total spent": 0,
        "First visit": today,
        "Last visit": today,
        Note: birthday,
      })
      .select("*")
      .maybeSingle();

    if (insertError) throw insertError;
    if (!created?.id) return Response.json({ error: "Loyalty member was not created." }, { status: 409 });

    return Response.json({ success: true, member: created });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to register loyalty member." }, { status: 500 });
  }
}
