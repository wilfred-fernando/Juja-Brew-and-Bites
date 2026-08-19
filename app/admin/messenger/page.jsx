"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, MessageCircle, PauseCircle, PlayCircle, Plus, Save, Users } from "lucide-react";

const emptyFlow = { name: "", pattern: "", text: "", status: "draft" };

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

export default function MessengerAdminPage() {
  const [flows, setFlows] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [aiStatus, setAiStatus] = useState({ configured: false, enabled: true, model: "gpt-5.6-luna" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyFlow);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [flowPayload, contactPayload] = await Promise.all([
        api("/api/admin/messenger/flows"),
        api("/api/admin/messenger/contacts"),
      ]);
      setFlows(flowPayload.flows || []);
      setAiStatus(flowPayload.ai || { configured: false, enabled: true, model: "gpt-5.6-luna" });
      setContacts(contactPayload.contacts || []);
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
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-800">Messenger Routing</h1>
          </div>
          <p className="text-sm font-medium text-slate-500">Manage automated flows, triggers, and staff handoffs.</p>
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
          ? `AI auto reply is active using ${aiStatus.model}.`
          : "AI flow is ready, but OPENAI_API_KEY must be added in Vercel before AI replies become active."}
        {!aiStatus.enabled && " MESSENGER_AI_ENABLED is currently false."}
      </div>

      <section className="mb-10">
        <div className="mb-4 flex items-center gap-2 text-slate-800"><MessageCircle className="h-5 w-5" /><h2 className="text-lg font-extrabold">Conversation flows</h2></div>
        {loading ? <div className="rounded-3xl bg-white/80 p-12 text-center text-sm font-semibold text-slate-500">Loading flows...</div> : (
          <div className="space-y-5">
            {flows.map((flow) => <FlowCard key={flow.id} flow={flow} onSaved={(saved) => setFlows((rows) => rows.map((row) => row.id === saved.id ? saved : row))} />)}
            {!flows.length && !error && <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-12 text-center text-sm font-semibold text-slate-500">No Messenger flows yet.</div>}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-800"><Users className="h-5 w-5" /><h2 className="text-lg font-extrabold">Waiting for staff</h2></div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">{contacts.length} paused</span>
        </div>
        <div className="space-y-3">
          {contacts.map((contact) => (
            <div key={contact.psid} className="flex flex-col gap-4 rounded-2xl border border-amber-100 bg-white/90 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-slate-800">{contact.display_name || `Messenger contact ${contact.psid.slice(-6)}`}</p>
                <p className="mt-1 text-xs text-slate-500">{contact.pause_reason || "Waiting for staff"}{contact.page_id ? ` · Page ${contact.page_id}` : ""}</p>
              </div>
              <button type="button" onClick={() => resumeBot(contact)} className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100">
                <PlayCircle className="h-4 w-4" /> Resume bot
              </button>
            </div>
          ))}
          {!loading && !contacts.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm font-semibold text-slate-500">No conversations are waiting for staff.</div>}
        </div>
      </section>
    </div>
  );
}
