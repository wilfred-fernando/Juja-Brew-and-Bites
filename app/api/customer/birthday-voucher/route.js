import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { createBirthdayVoucherIfNeeded } from "@/lib/loyalty/birthdayVoucher";

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

export async function POST(req) {
  try {
    const { url, serviceRoleKey } = supabaseConfig();
    if (!url || !serviceRoleKey) {
      return Response.json({ error: "Supabase service role key is required for birthday vouchers." }, { status: 500 });
    }

    const user = await getRequesterUser();
    if (!user?.id) return Response.json({ error: "Customer login is required." }, { status: 401 });

    const { memberId } = await req.json();
    if (!memberId) return Response.json({ error: "Loyalty member is required." }, { status: 400 });

    const admin = createSupabaseClient(url, serviceRoleKey);
    const { data: member, error: memberError } = await admin
      .from("loyalty_members")
      .select("id,user_id")
      .eq("id", memberId)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!member?.id) return Response.json({ error: "Loyalty member was not found." }, { status: 404 });
    if (String(member.user_id || "") !== String(user.id)) {
      return Response.json({ error: "This loyalty account is not linked to your customer login." }, { status: 403 });
    }

    const result = await createBirthdayVoucherIfNeeded(admin, memberId);
    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to create birthday voucher." }, { status: 500 });
  }
}
