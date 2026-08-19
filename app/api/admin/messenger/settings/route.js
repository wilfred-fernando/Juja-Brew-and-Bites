import { requireAdminApi } from "@/lib/server/admin-api";
import { DEFAULT_MESSENGER_AI_SETTINGS } from "@/lib/messenger/context";

function clean(value) {
  return String(value || "").trim();
}

async function loadSettings(admin) {
  const now = new Date().toISOString();
  const [{ data, error }, countResult, packageCountResult, bookingCountResult] = await Promise.all([
    admin.from("messenger_ai_settings").select("*").eq("id", 1).maybeSingle(),
    admin.from("menu_items").select("id", { count: "exact", head: true }).eq("is_available", true).or("pos_only.is.null,pos_only.eq.false"),
    admin.from("function_room_packages").select("id", { count: "exact", head: true }).eq("is_active", true),
    admin.from("function_room_bookings").select("id", { count: "exact", head: true }).in("status", ["pending", "confirmed", "cancellation_requested"]).gte("end_at", now),
  ]);
  if (error) throw error;
  if (countResult.error) throw countResult.error;
  if (packageCountResult.error) throw packageCountResult.error;
  if (bookingCountResult.error) throw bookingCountResult.error;
  return {
    ...DEFAULT_MESSENGER_AI_SETTINGS,
    ...(data || {}),
    menu_item_count: countResult.count || 0,
    function_room_package_count: packageCountResult.count || 0,
    upcoming_function_room_booking_count: bookingCountResult.count || 0,
  };
}

export async function GET() {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;
    return Response.json({ settings: await loadSettings(admin) });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to load JujaBot settings." }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { admin, user, response } = await requireAdminApi();
    if (response) return response;
    const body = await request.json();
    const instructions = clean(body?.instructions);
    const referenceNotes = clean(body?.reference_notes);
    if (instructions.length > 8000) return Response.json({ error: "AI instructions must be 8,000 characters or fewer." }, { status: 400 });
    if (referenceNotes.length > 16000) return Response.json({ error: "Reference notes must be 16,000 characters or fewer." }, { status: 400 });

    const { error } = await admin.from("messenger_ai_settings").upsert({
      id: 1,
      instructions,
      reference_notes: referenceNotes,
      include_live_menu: body?.include_live_menu !== false,
      include_function_room: body?.include_function_room !== false,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    }, { onConflict: "id" });
    if (error) throw error;
    return Response.json({ success: true, settings: await loadSettings(admin) });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to save JujaBot settings." }, { status: 500 });
  }
}
