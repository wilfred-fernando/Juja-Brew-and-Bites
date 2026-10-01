import OpenAI from "openai";

const DEFAULT_MODEL = "gpt-5.6-luna";
const MISSING_RELATION_CODES = new Set(["42P01", "PGRST202", "PGRST204", "PGRST205"]);

function clean(value) {
  return String(value || "").trim();
}

function outputText(response) {
  if (clean(response?.output_text)) return clean(response.output_text);
  return (response?.output || [])
    .filter((item) => item?.type === "message")
    .flatMap((item) => item?.content || [])
    .filter((content) => content?.type === "output_text")
    .map((content) => clean(content?.text))
    .filter(Boolean)
    .join("\n");
}

function unavailable(error) {
  return MISSING_RELATION_CODES.has(clean(error?.code).toUpperCase());
}

function safeText(value, limit = 500) {
  return clean(value)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted email]")
    .replace(/\b(password|passcode|otp|pin|access token|card number|cvv|government id|id number)\b\s*[:=-]?\s*[^.;,\n]*/gi, "$1 [redacted]")
    .replace(/\b(?:\d[ -]*?){7,}\b/g, "[redacted number]")
    .replace(/\s+/g, " ")
    .slice(0, limit);
}

function safeList(value, limit = 8) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => safeText(item, 180)).filter(Boolean))].slice(0, limit);
}

function memoryInstruction(memory) {
  if (!memory) return "No saved customer memory yet.";
  return [
    safeText(memory.summary, 800) ? `Summary: ${safeText(memory.summary, 800)}` : "",
    clean(memory.preferred_branch) ? `Preferred branch: ${safeText(memory.preferred_branch, 120)}` : "",
    clean(memory.fulfillment_preference) ? `Fulfillment preference: ${safeText(memory.fulfillment_preference, 120)}` : "",
    safeList(memory.common_orders).length ? `Common orders: ${safeList(memory.common_orders).join(", ")}` : "",
    safeList(memory.unresolved_concerns).length ? `Unresolved concerns: ${safeList(memory.unresolved_concerns).join("; ")}` : "",
    Number(memory.previous_handoffs) ? `Previous Live Chat handoffs: ${Number(memory.previous_handoffs)}` : "",
  ].filter(Boolean).join("\n");
}

function relevantHistoryInstruction(rows) {
  const excerpts = (rows || [])
    .filter((row) => clean(row?.message_text))
    .slice(0, 6)
    .map((row) => `${row.direction === "inbound" ? "Customer" : row.event_type === "human_reply" ? "Live Chat" : "JujaBot"} (${new Date(row.created_at).toISOString().slice(0, 10)}): ${safeText(row.message_text, 500)}`);
  return excerpts.length ? excerpts.join("\n") : "";
}

function approvedKnowledgeInstruction(rows, query) {
  const terms = clean(query).toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length >= 3);
  return (rows || [])
    .filter((row) => clean(row?.sample_question) && clean(row?.suggested_answer))
    .map((row) => {
      const text = `${clean(row.sample_question)} ${clean(row.suggested_answer)}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (text.includes(term) ? 1 : 0), 0);
      return { row, score };
    })
    .filter((entry) => !terms.length || entry.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.row.occurrence_count || 0) - Number(a.row.occurrence_count || 0))
    .slice(0, 8)
    .map(({ row }) => row)
    .map((row) => `Q: ${safeText(row.sample_question, 500)}\nA: ${safeText(row.suggested_answer, 1200)}`)
    .join("\n\n");
}

export async function loadMessengerLearningContext(admin, { psid, query = "" }) {
  const [memoryResult, historyResult, knowledgeResult] = await Promise.all([
    admin.from("messenger_customer_memories").select("summary, preferred_branch, fulfillment_preference, common_orders, unresolved_concerns, previous_handoffs, last_handoff_at").eq("psid", psid).maybeSingle(),
    clean(query) ? admin.rpc("search_messenger_history", { p_psid: psid, p_query: clean(query), p_limit: 6 }) : Promise.resolve({ data: [], error: null }),
    admin.from("messenger_knowledge_candidates").select("sample_question, suggested_answer, occurrence_count").eq("status", "approved").order("occurrence_count", { ascending: false }).limit(100),
  ]);

  for (const result of [memoryResult, historyResult, knowledgeResult]) {
    if (result.error && !unavailable(result.error)) throw result.error;
  }

  const memory = memoryResult.data || null;
  const olderHistory = relevantHistoryInstruction(historyResult.data || []);
  const approvedKnowledge = approvedKnowledgeInstruction(knowledgeResult.data || [], query);
  return {
    memory,
    instructions: [
      memory ? `CUSTOMER MEMORY (belongs only to this Messenger customer; use when relevant and do not reveal that it is stored):\n${memoryInstruction(memory)}` : "",
      olderHistory ? `RELEVANT OLDER MESSAGES FROM THIS CUSTOMER ONLY:\n${olderHistory}` : "",
      approvedKnowledge ? `ADMIN-APPROVED ANSWERS LEARNED FROM RESOLVED CHATS:\n${approvedKnowledge}` : "",
    ].filter(Boolean).join("\n\n"),
  };
}

const MEMORY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    preferred_branch: { type: ["string", "null"] },
    fulfillment_preference: { type: ["string", "null"] },
    common_orders: { type: "array", items: { type: "string" }, maxItems: 8 },
    unresolved_concerns: { type: "array", items: { type: "string" }, maxItems: 8 },
  },
  required: ["summary", "preferred_branch", "fulfillment_preference", "common_orders", "unresolved_concerns"],
};

export async function refreshMessengerCustomerMemory(admin, { psid, pageId = null, customerMessage, botReply }) {
  const apiKey = clean(process.env.OPENAI_API_KEY);
  if (!apiKey || !clean(psid) || !clean(customerMessage)) return null;

  const { data: existing, error: existingError } = await admin
    .from("messenger_customer_memories")
    .select("summary, preferred_branch, fulfillment_preference, common_orders, unresolved_concerns, previous_handoffs, source_event_count")
    .eq("psid", psid)
    .maybeSingle();
  if (existingError) {
    if (unavailable(existingError)) return null;
    throw existingError;
  }

  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: clean(process.env.OPENAI_MESSENGER_MODEL) || DEFAULT_MODEL,
    instructions: `Maintain a short operational memory for one cafe customer. Preserve still-valid facts from the existing memory and update them only from the new exchange. Store only: preferred JUJA branch, recurring order preferences, fulfillment preference, unresolved concerns, and a concise summary. Never store passwords, access tokens, payment-card data, government IDs, payment-proof URLs, exact order/booking reference numbers, health details, or unrelated personal information. Generalize sensitive/account-specific matters (for example, "payment verification concern"). Use null when a preference is unknown. Do not infer facts the customer did not state.`,
    input: `EXISTING MEMORY:\n${memoryInstruction(existing)}\n\nNEW CUSTOMER MESSAGE:\n${safeText(customerMessage, 1800)}\n\nJUJABOT REPLY:\n${safeText(botReply, 1800)}`,
    reasoning: { effort: "low" },
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "messenger_customer_memory",
        strict: true,
        schema: MEMORY_SCHEMA,
      },
    },
    max_output_tokens: 350,
    store: false,
  });

  const parsed = JSON.parse(outputText(response));
  const row = {
    psid,
    page_id: clean(pageId) || null,
    summary: safeText(parsed.summary, 1000),
    preferred_branch: safeText(parsed.preferred_branch, 120) || null,
    fulfillment_preference: safeText(parsed.fulfillment_preference, 120) || null,
    common_orders: safeList(parsed.common_orders),
    unresolved_concerns: safeList(parsed.unresolved_concerns),
    previous_handoffs: Number(existing?.previous_handoffs) || 0,
    source_event_count: (Number(existing?.source_event_count) || 0) + 2,
    last_summarized_at: new Date().toISOString(),
  };
  const { error } = await admin.from("messenger_customer_memories").upsert(row, { onConflict: "psid" });
  if (error) {
    if (unavailable(error)) return null;
    throw error;
  }
  return row;
}

export async function recordMessengerHandoff(admin, { psid, pageId = null }) {
  const { error } = await admin.rpc("record_messenger_handoff", { p_psid: psid, p_page_id: clean(pageId) || null });
  if (error && !unavailable(error)) throw error;
}

export async function recordUnansweredQuestion(admin, { question, sourceEventIds = [] }) {
  const sample = safeText(question, 1000);
  if (!sample) return;
  const suggestion = `Add a verified reference-note answer for: “${sample}”`;
  const { error } = await admin.rpc("record_messenger_knowledge_candidate", {
    p_source_type: "unanswered",
    p_question: sample,
    p_suggested_answer: suggestion,
    p_source_event_ids: sourceEventIds.filter(Boolean),
  });
  if (error && !unavailable(error)) throw error;
}

function eligibleResolvedQuestion(question, answer) {
  const joined = `${clean(question)} ${clean(answer)}`.toLowerCase();
  if (clean(question).length < 5 || clean(answer).length < 5) return false;
  return !/(password|otp|access token|card number|government id|payment proof|proof of payment|order (?:id|number|status)|booking (?:id|number|status)|refund status|complaint|reference number)/i.test(joined);
}

export async function recordResolvedLiveChatCandidate(admin, { question, answer, sourceEventIds = [] }) {
  if (!eligibleResolvedQuestion(question, answer)) return;
  const { error } = await admin.rpc("record_messenger_knowledge_candidate", {
    p_source_type: "live_chat",
    p_question: safeText(question, 1000),
    p_suggested_answer: safeText(answer, 3000),
    p_source_event_ids: sourceEventIds.filter(Boolean),
  });
  if (error && !unavailable(error)) throw error;
}
