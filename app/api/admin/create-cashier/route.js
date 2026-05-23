import { createClient } from "@supabase/supabase-js";

export async function POST(req) {
  try {
    const body = await req.json();

    const { email, full_name, store_id } = body;

    if (!email || !store_id) {
      return Response.json(
        { error: "email and store_id required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: "Juja@123456",
        email_confirm: true,
      });

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    const userId = data.user.id;

    await supabaseAdmin
      .from("profiles")
      .update({
        full_name,
        role: "cashier",
        store_id,
        must_change_password: true,
      })
      .eq("id", userId);

    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { error: err.message },
      { status: 500 }
    );
  }
}