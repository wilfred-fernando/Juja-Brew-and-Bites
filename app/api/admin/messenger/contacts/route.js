import { requireAdminApi } from "@/lib/server/admin-api";

export async function GET() {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;
    const now = new Date().toISOString();
    const { error: resumeError } = await admin.from("messenger_contacts").update({
      bot_paused: false,
      pause_reason: null,
      paused_at: null,
      auto_resume_at: null,
    }).eq("bot_paused", true).not("auto_resume_at", "is", null).lte("auto_resume_at", now);
    if (resumeError) throw resumeError;
    const { data, error } = await admin
      .from("messenger_contacts")
      .select("*")
      .eq("bot_paused", true)
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return Response.json({ contacts: data || [] });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to load Messenger handoffs." }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;
    const body = await request.json();
    const psid = String(body?.psid || "").trim();
    if (!psid) return Response.json({ error: "Messenger contact ID is required." }, { status: 400 });
    const paused = Boolean(body?.bot_paused);
    const { data, error } = await admin.from("messenger_contacts").update({
      bot_paused: paused,
      pause_reason: paused ? String(body?.pause_reason || "Paused by admin").trim() : null,
      paused_at: paused ? new Date().toISOString() : null,
      auto_resume_at: null,
    }).eq("psid", psid).select("*").maybeSingle();
    if (error) throw error;
    return Response.json({ success: true, contact: data });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to update Messenger handoff." }, { status: 500 });
  }
}
