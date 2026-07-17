import { createClient } from "@supabase/supabase-js";

const PAYMENT_HOLD_HOURS = 24;

export async function POST() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
      return Response.json(
        { error: "Supabase service role key is required to expire stale bookings." },
        { status: 500 }
      );
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const cutoff = new Date(Date.now() - PAYMENT_HOLD_HOURS * 60 * 60 * 1000).toISOString();

    const { data, error } = await admin
      .from("function_room_bookings")
      .update({ status: "expired" })
      .eq("status", "pending")
      .eq("payment_status", "waiting_for_payment")
      .is("payment_proof_url", null)
      .lt("created_at", cutoff)
      .select("id, status");

    if (error) throw error;

    return Response.json({
      success: true,
      expiredIds: (data || []).map((booking) => booking.id),
    });
  } catch (error) {
    return Response.json(
      { error: error?.message || "Unable to expire stale bookings." },
      { status: 500 }
    );
  }
}
