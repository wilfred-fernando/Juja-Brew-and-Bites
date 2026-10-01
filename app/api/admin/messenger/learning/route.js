import { requireAdminApi } from "@/lib/server/admin-api";

function clean(value) {
  return String(value || "").trim();
}

async function loadLearning(admin) {
  const [memoryCountResult, pendingUnansweredResult, pendingLiveChatResult, approvedResult, candidatesResult] = await Promise.all([
    admin.from("messenger_customer_memories").select("psid", { count: "exact", head: true }),
    admin.from("messenger_knowledge_candidates").select("id", { count: "exact", head: true }).eq("status", "pending").eq("source_type", "unanswered"),
    admin.from("messenger_knowledge_candidates").select("id", { count: "exact", head: true }).eq("status", "pending").eq("source_type", "live_chat"),
    admin.from("messenger_knowledge_candidates").select("id", { count: "exact", head: true }).eq("status", "approved"),
    admin
      .from("messenger_knowledge_candidates")
      .select("id, source_type, sample_question, suggested_answer, occurrence_count, status, admin_notes, reviewed_at, created_at, updated_at")
      .order("status", { ascending: false })
      .order("occurrence_count", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);
  for (const result of [memoryCountResult, pendingUnansweredResult, pendingLiveChatResult, approvedResult]) {
    if (result.error) throw result.error;
  }
  if (candidatesResult.error) throw candidatesResult.error;

  const candidates = candidatesResult.data || [];
  return {
    stats: {
      remembered_customers: memoryCountResult.count || 0,
      pending_unanswered: pendingUnansweredResult.count || 0,
      pending_live_chat: pendingLiveChatResult.count || 0,
      approved_answers: approvedResult.count || 0,
    },
    candidates,
  };
}

export async function GET() {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;
    return Response.json({ learning: await loadLearning(admin) });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to load JujaBot learning data." }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { admin, user, response } = await requireAdminApi();
    if (response) return response;
    const body = await request.json();
    const id = clean(body?.id);
    const action = clean(body?.action).toLowerCase();
    const suggestedAnswer = clean(body?.suggested_answer);
    const adminNotes = clean(body?.admin_notes);
    if (!id || !["approve", "reject", "reopen"].includes(action)) {
      return Response.json({ error: "A candidate and valid review action are required." }, { status: 400 });
    }
    if (suggestedAnswer.length > 4000 || adminNotes.length > 2000) {
      return Response.json({ error: "The approved answer or admin notes are too long." }, { status: 400 });
    }
    if (action === "approve" && (suggestedAnswer.length < 5 || suggestedAnswer.startsWith("Add a verified reference-note answer for:"))) {
      return Response.json({ error: "Replace the suggestion with a verified customer-facing answer before approval." }, { status: 400 });
    }

    const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "pending";
    const updates = {
      status,
      suggested_answer: suggestedAnswer,
      admin_notes: adminNotes,
      reviewed_by: action === "reopen" ? null : user.id,
      reviewed_at: action === "reopen" ? null : new Date().toISOString(),
    };
    const { error } = await admin.from("messenger_knowledge_candidates").update(updates).eq("id", id);
    if (error) throw error;
    return Response.json({ success: true, learning: await loadLearning(admin) });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to review JujaBot learning data." }, { status: 500 });
  }
}
