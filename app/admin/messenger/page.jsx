"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Bot, Brain, CheckCircle, Lightbulb, MessageCircle, PauseCircle, PlayCircle, Plus, RotateCcw, Save, Users, XCircle } from "lucide-react";

const emptyFlow = { name: "", pattern: "", text: "", status: "draft" };
const emptyAiSettings = {
  instructions: "",
  reference_notes: "",
  include_live_menu: true,
  include_function_room: true,
  menu_item_count: 0,
  function_room_package_count: 0,
  upcoming_function_room_booking_count: 0,
};
const emptyLearning = {
  stats: { remembered_customers: 0, pending_unanswered: 0, pending_live_chat: 0, approved_answers: 0 },
  candidates: [],
};

async function api(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Messenger request failed.");
  return payload;
}

function FlowCard({ flow, onSaved }) {
  const startNode = flow.nodes?.find((node) => node.node_key === flow.start_node_key) || flow.nodes?.[0];
  const isAiNode = startNode?.node_type === "ai";
  const primaryTrigger = flow.triggers?.find((trigger) => trigger.trigger_type !== "fallback") || flow.triggers?.[0];
  const [name, setName] = useState(flow.name || "");
  const [description, setDescription] = useState(flow.description || "");
  const [text, setText] = useState(isAiNode ? startNode?.config?.instructions || "" : startNode?.config?.text || "");
  const [pattern, setPattern] = useState(primaryTrigger?.pattern || "");
  const [saving, setSaving] = useState(false);

  async function save(overrides = {}) {
    setSaving(true);
    try {
      const payload = await api("/api/admin/messenger/flows", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flow_id: flow.id,
          flow: { name, description, status: overrides.status || flow.status },
          ...(startNode ? { node: { id: startNode.id, config: { ...startNode.config, [isAiNode ? "instructions" : "text"]: text } } } : {}),
          ...(primaryTrigger ? { trigger: { id: primaryTrigger.id, pattern } } : {}),
        }),
      });
      onSaved(payload.flow);
    } catch (error) {
      alert(error?.message || "Unable to save flow.");
    } finally {
      setSaving(false);
    }
  }

  const published = flow.status === "published";
  return (
    <article className="rounded-3xl border border-sky-100 bg-white/90 p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${published ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
              {flow.status}
            </span>
            <span className="rounded-full bg-sky-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-sky-700">
              {flow.nodes?.length || 0} nodes
            </span>
            <span className="rounded-full bg-violet-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-violet-700">
              {flow.triggers?.length || 0} triggers
            </span>
          </div>
          <input value={name} onChange={(event) => setName(event.target.value)} className="w-full border-0 bg-transparent p-0 text-xl font-extrabold text-slate-800 outline-none" aria-label="Flow name" />
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Flow description" className="mt-1 w-full border-0 bg-transparent p-0 text-sm text-slate-500 outline-none" aria-label="Flow description" />
        </div>
        <button type="button" disabled={saving} onClick={() => save({ status: published ? "draft" : "published" })} className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition ${published ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
          {published ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
          {published ? "Unpublish" : "Publish"}
        </button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[220px_1fr]">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Primary trigger
          <input value={pattern} disabled={!primaryTrigger || primaryTrigger.trigger_type === "fallback"} onChange={(event) => setPattern(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-800 outline-none focus:border-sky-400 disabled:bg-slate-50" />
          <span className="mt-1 block text-[10px] font-medium normal-case tracking-normal text-slate-400">
            {primaryTrigger ? `${primaryTrigger.trigger_type} · ${primaryTrigger.match_type}` : "No trigger"}
          </span>
        </label>
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {isAiNode ? "AI instructions" : "Start message"}
          <textarea value={text} disabled={!startNode || !["message", "question", "handoff", "ai"].includes(startNode.node_type)} onChange={(event) => setText(event.target.value)} rows={4} className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium normal-case leading-6 tracking-normal text-slate-800 outline-none focus:border-sky-400 disabled:bg-slate-50" />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(flow.nodes || []).map((node) => (
          <span key={node.id} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
            {node.node_key}: {node.node_type}
          </span>
        ))}
      </div>

      <div className="mt-5 flex justify-end">
        <button type="button" disabled={saving || !name.trim()} onClick={() => save()} className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-slate-700 disabled:opacity-50">
          <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save flow"}
        </button>
      </div>
    </article>
  );
}

function LearningReviewCard({ candidate, onReviewed }) {
  const [answer, setAnswer] = useState(candidate.suggested_answer || "");
  const [notes, setNotes] = useState(candidate.admin_notes || "");
  const [saving, setSaving] = useState(false);

  async function review(action) {
    setSaving(true);
    try {
      const payload = await api("/api/admin/messenger/learning", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: candidate.id, action, suggested_answer: answer, admin_notes: notes }),
      });
      onReviewed(payload.learning || emptyLearning);
    } catch (reviewError) {
      alert(reviewError?.message || "Unable to review this answer.");
    } finally {
      setSaving(false);
    }
  }

  const pending = candidate.status === "pending";
  return (
    <article className="rounded-2xl border border-slate-200 bg-white/90 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${candidate.source_type === "unanswered" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>
          {candidate.source_type === "unanswered" ? "Unanswered" : "Live Chat answer"}
        </span>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${candidate.status === "approved" ? "bg-emerald-100 text-emerald-700" : candidate.status === "rejected" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
          {candidate.status}
        </span>
        <span className="text-xs font-bold text-slate-500">Seen {candidate.occurrence_count} time{candidate.occurrence_count === 1 ? "" : "s"}</span>
      </div>
      <p className="mt-3 text-sm font-bold leading-6 text-slate-800">{candidate.sample_question}</p>
      <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-slate-500">
        Suggested approved answer
        <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={4} maxLength={4000} className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium normal-case leading-6 tracking-normal text-slate-800 outline-none focus:border-violet-400" />
      </label>
      <label className="mt-3 block text-xs font-bold uppercase tracking-wider text-slate-500">
        Admin notes
        <input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-800 outline-none focus:border-violet-400" />
      </label>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {pending ? (
          <>
            <button type="button" disabled={saving} onClick={() => review("reject")} className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"><XCircle className="h-4 w-4" /> Reject</button>
            <button type="button" disabled={saving} onClick={() => review("approve")} className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><CheckCircle className="h-4 w-4" /> Approve answer</button>
          </>
        ) : (
          <button type="button" disabled={saving} onClick={() => review("reopen")} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><RotateCcw className="h-4 w-4" /> Reopen review</button>
        )}
      </div>
    </article>
  );
}

export default function MessengerAdminPage() {
  const [flows, setFlows] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [aiStatus, setAiStatus] = useState({ configured: false, enabled: true, model: "gpt-5.6-luna" });
  const [aiSettings, setAiSettings] = useState(emptyAiSettings);
  const [learning, setLearning] = useState(emptyLearning);
  const [savingAiSettings, setSavingAiSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyFlow);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [flowPayload, contactPayload, settingsPayload, learningPayload] = await Promise.all([
        api("/api/admin/messenger/flows"),
        api("/api/admin/messenger/contacts"),
        api("/api/admin/messenger/settings"),
        api("/api/admin/messenger/learning"),
      ]);
      setFlows(flowPayload.flows || []);
      setAiStatus(flowPayload.ai || { configured: false, enabled: true, model: "gpt-5.6-luna" });
      setContacts(contactPayload.contacts || []);
      setAiSettings(settingsPayload.settings || emptyAiSettings);
      setLearning(learningPayload.learning || emptyLearning);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load Messenger routing.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createFlow(event) {
    event.preventDefault();
    setCreating(true);
    try {
      const payload = await api("/api/admin/messenger/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          trigger_type: "keyword",
          match_type: "contains",
        }),
      });
      setFlows((rows) => [...rows, payload.flow].filter(Boolean));
      setForm(emptyFlow);
      setShowCreate(false);
    } catch (createError) {
      alert(createError?.message || "Unable to create flow.");
    } finally {
      setCreating(false);
    }
  }

  async function saveAiSettings(event) {
    event.preventDefault();
    setSavingAiSettings(true);
    try {
      const payload = await api("/api/admin/messenger/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiSettings),
      });
      setAiSettings(payload.settings || aiSettings);
    } catch (saveError) {
      alert(saveError?.message || "Unable to save JujaBot settings.");
    } finally {
      setSavingAiSettings(false);
    }
  }

  async function resumeBot(contact) {
    try {
      await api("/api/admin/messenger/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ psid: contact.psid, bot_paused: false }),
      });
      setContacts((rows) => rows.filter((row) => row.psid !== contact.psid));
    } catch (resumeError) {
      alert(resumeError?.message || "Unable to resume automation.");
    }
  }

  return (
    <div className="mx-auto max-w-6xl pb-20">
      <header className="mb-8 flex flex-col gap-5 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700"><Bot className="h-6 w-6" /></span>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-800">JujaBot</h1>
          </div>
          <p className="text-sm font-medium text-slate-500">AI answers customer questions by default and pauses when someone requests Live Chat.</p>
        </div>
        <button type="button" onClick={() => setShowCreate((value) => !value)} className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-600 px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-sky-700">
          <Plus className="h-4 w-4" /> New flow
        </button>
      </header>

      {showCreate && (
        <form onSubmit={createFlow} className="mb-8 grid gap-4 rounded-3xl border border-sky-200 bg-sky-50/80 p-6 md:grid-cols-2">
          <input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Flow name" className="rounded-xl border border-sky-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-500" />
          <input required value={form.pattern} onChange={(event) => setForm((current) => ({ ...current, pattern: event.target.value }))} placeholder="Keyword trigger, e.g. catering" className="rounded-xl border border-sky-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-500" />
          <textarea required value={form.text} onChange={(event) => setForm((current) => ({ ...current, text: event.target.value }))} placeholder="Reply message" rows={4} className="rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-500 md:col-span-2" />
          <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={form.status === "published"} onChange={(event) => setForm((current) => ({ ...current, status: event.target.checked ? "published" : "draft" }))} />
            Publish immediately
          </label>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded-full px-4 py-2 text-xs font-bold text-slate-600">Cancel</button>
            <button disabled={creating} className="rounded-full bg-slate-800 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{creating ? "Creating..." : "Create flow"}</button>
          </div>
        </form>
      )}

      {error && <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>}

      <div className={`mb-6 rounded-2xl border p-4 text-sm font-semibold ${aiStatus.configured ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
        {aiStatus.configured
          ? `JujaBot is active using ${aiStatus.model}. ${aiStatus.routingMode === "flows" ? "Conversation-flow mode is enabled." : "All normal messages go directly to JujaBot."}`
          : "JujaBot is ready, but OPENAI_API_KEY must be added in Vercel before replies become active."}
        {!aiStatus.enabled && " MESSENGER_AI_ENABLED is currently false."}
      </div>

      <form onSubmit={saveAiSettings} className="mb-10 rounded-3xl border border-violet-100 bg-white/90 p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-800"><BookOpen className="h-5 w-5" /><h2 className="text-lg font-extrabold">Answer instructions and references</h2></div>
            <p className="mt-1 text-sm text-slate-500">These server-only notes guide JujaBot’s replies. Live menu prices and function-room availability are loaded from the database automatically.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="whitespace-nowrap rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">{aiSettings.menu_item_count || 0} public menu items</span>
            <span className="whitespace-nowrap rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">{aiSettings.function_room_package_count || 0} room packages</span>
            <span className="whitespace-nowrap rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">{aiSettings.upcoming_function_room_booking_count || 0} upcoming holds</span>
          </div>
        </div>

        <div className="grid gap-5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            AI instructions
            <textarea value={aiSettings.instructions || ""} maxLength={8000} onChange={(event) => setAiSettings((current) => ({ ...current, instructions: event.target.value }))} rows={5} placeholder="Example: Use friendly Taglish. Keep answers concise. Recommend Live Chat for allergy questions." className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium normal-case leading-6 tracking-normal text-slate-800 outline-none focus:border-violet-400" />
            <span className="mt-1 block text-right text-[10px] font-medium normal-case tracking-normal text-slate-400">{(aiSettings.instructions || "").length}/8,000</span>
          </label>

          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Business reference notes
            <textarea value={aiSettings.reference_notes || ""} maxLength={16000} onChange={(event) => setAiSettings((current) => ({ ...current, reference_notes: event.target.value }))} rows={7} placeholder="Add verified policies, parking details, booking rules, accepted payments, delivery notes, or other facts JujaBot may reference." className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium normal-case leading-6 tracking-normal text-slate-800 outline-none focus:border-violet-400" />
            <span className="mt-1 block text-right text-[10px] font-medium normal-case tracking-normal text-slate-400">{(aiSettings.reference_notes || "").length}/16,000</span>
          </label>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={aiSettings.include_live_menu !== false} onChange={(event) => setAiSettings((current) => ({ ...current, include_live_menu: event.target.checked }))} />
                Use live menu names, descriptions, variants, and prices
              </label>
              <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={aiSettings.include_function_room !== false} onChange={(event) => setAiSettings((current) => ({ ...current, include_function_room: event.target.checked }))} />
                Use live function-room packages and 60-day slot availability
              </label>
            </div>
            <button type="submit" disabled={savingAiSettings} className="inline-flex items-center justify-center gap-2 rounded-full bg-violet-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-violet-700 disabled:opacity-50">
              <Save className="h-4 w-4" /> {savingAiSettings ? "Saving..." : "Save JujaBot settings"}
            </button>
          </div>
        </div>
      </form>

      <section className="mb-10 rounded-3xl border border-emerald-100 bg-white/90 p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-800"><Brain className="h-5 w-5" /><h2 className="text-lg font-extrabold">JujaBot learning review</h2></div>
            <p className="mt-1 text-sm text-slate-500">Customer memories stay customer-scoped. Answers from Live Chat and unanswered questions are never added to JujaBot’s shared knowledge until an administrator approves them here.</p>
          </div>
          <span className="inline-flex items-center gap-2 self-start rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700"><Lightbulb className="h-3.5 w-3.5" /> Approval required</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Remembered customers", learning.stats.remembered_customers, "bg-violet-50 text-violet-700"],
            ["Unanswered questions", learning.stats.pending_unanswered, "bg-amber-50 text-amber-700"],
            ["Live Chat candidates", learning.stats.pending_live_chat, "bg-sky-50 text-sky-700"],
            ["Approved answers", learning.stats.approved_answers, "bg-emerald-50 text-emerald-700"],
          ].map(([label, value, colors]) => (
            <div key={label} className={`rounded-2xl p-4 ${colors}`}>
              <p className="text-2xl font-extrabold">{value || 0}</p>
              <p className="mt-1 text-xs font-bold">{label}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          {(learning.candidates || []).map((candidate) => <LearningReviewCard key={candidate.id} candidate={candidate} onReviewed={setLearning} />)}
          {!loading && !(learning.candidates || []).length && <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center text-sm font-semibold text-slate-500">No unanswered questions or Live Chat answer candidates yet.</div>}
        </div>
      </section>

      <section className="mb-10">
        <div className="mb-4 flex items-center gap-2 text-slate-800"><MessageCircle className="h-5 w-5" /><h2 className="text-lg font-extrabold">Optional conversation flows</h2></div>
        {loading ? <div className="rounded-3xl bg-white/80 p-12 text-center text-sm font-semibold text-slate-500">Loading flows...</div> : (
          <div className="space-y-5">
            {flows.map((flow) => <FlowCard key={flow.id} flow={flow} onSaved={(saved) => setFlows((rows) => rows.map((row) => row.id === saved.id ? saved : row))} />)}
            {!flows.length && !error && <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-12 text-center text-sm font-semibold text-slate-500">No Messenger flows yet.</div>}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-800"><Users className="h-5 w-5" /><h2 className="text-lg font-extrabold">Waiting for Live Chat</h2></div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">{contacts.length} paused</span>
        </div>
        <div className="space-y-3">
          {contacts.map((contact) => (
            <div key={contact.psid} className="flex flex-col gap-4 rounded-2xl border border-amber-100 bg-white/90 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-slate-800">{contact.display_name || `Messenger contact ${contact.psid.slice(-6)}`}</p>
                <p className="mt-1 text-xs text-slate-500">{contact.pause_reason || "Waiting for Live Chat"}{contact.page_id ? ` · Page ${contact.page_id}` : ""}</p>
                {contact.auto_resume_at && <p className="mt-1 text-xs font-semibold text-amber-700">Auto resumes {new Date(contact.auto_resume_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}</p>}
              </div>
              <button type="button" onClick={() => resumeBot(contact)} className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100">
                <PlayCircle className="h-4 w-4" /> Resume bot
              </button>
            </div>
          ))}
          {!loading && !contacts.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm font-semibold text-slate-500">No conversations are waiting for Live Chat.</div>}
        </div>
      </section>
    </div>
  );
}
