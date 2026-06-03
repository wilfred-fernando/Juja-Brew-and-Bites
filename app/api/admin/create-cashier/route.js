import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

async function getRequestUserRole() {
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
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) return null;
  return String(profile?.role || "").toLowerCase();
}

export async function POST(req) {
  try {
    const requesterRole = await getRequestUserRole();
    if (!["admin", "super_admin"].includes(requesterRole)) {
      return Response.json({ error: "Admin access required." }, { status: 403 });
    }

    const { email, full_name, store_id } = await req.json();
    if (!email || !full_name || !store_id) {
      return Response.json({ error: "Email, full name, and store are required." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: "Juja@123456",
      email_confirm: true,
    });

    if (createErr) {
      return Response.json({ error: createErr.message }, { status: 500 });
    }

    const userId = data.user.id;
    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        full_name,
        role: "cashier",
        store_id,
        is_active: true,
        sort_order: 0,
        must_change_password: true,
      });

    if (profileErr) {
      return Response.json({ error: profileErr.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err?.message || "Unable to create cashier." }, { status: 500 });
  }
}
