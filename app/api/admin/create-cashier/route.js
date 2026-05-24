import { createClient } from "@supabase/supabase-js";

export async function POST(req) {
  try {
    const { email, full_name, store_id } = await req.json();

    console.log("Creating cashier:", email);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // ✅ Create user
    const { data, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: "Juja@123456",
        email_confirm: true,
      });

    if (createErr) {
      console.error("CREATE ERROR:", createErr);
      return Response.json({ error: createErr.message }, { status: 500 });
    }

    // ✅ ALSO INSERT INTO CASHIERS TABLE
    const { error: cashierErr } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: userId, // important: match auth id
        full_name: full_name,
        role: "cashier",
        store_id: store_id,
        is_active: true,
        sort_order: 0,
      });

if (cashierErr) {
  console.error("CASHIER INSERT ERROR:", cashierErr);
}
    const userId = data.user.id;

    // ✅ UPSERT profile (safer)
    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        full_name,
        role: "cashier",
        store_id,
        must_change_password: true,
      });

    if (profileErr) {
      console.error("PROFILE ERROR:", profileErr);
      return Response.json({ error: profileErr.message }, { status: 500 });
    }

    console.log("✅ Cashier created:", userId);

    return Response.json({ success: true });
  } catch (err) {
    console.error("API CRASH:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}