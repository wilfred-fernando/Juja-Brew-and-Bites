"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function ChargedDiningOptionDialog({ receipt, onClose, onSaved }) {
  const [order, setOrder] = useState(null);
  const [options, setOptions] = useState([]);
  const [optionId, setOptionId] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(null);
  const saving = useRef(false);
  const selected = options.find(option => option.id === optionId);
  const bookingProtected = Boolean(order?.source_metadata?.booking_id || order?.source_metadata?.reservation_credit || /^VIP Booking/i.test(order?.dining_option || order?.order_type || ""));
  const needsReference = /grab|shopee|panda|vip room/i.test(selected?.name || "");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const client = getSupabaseClient();
      const result = await client.from("orders").select("*").eq("id", receipt.order_id || receipt.id).single();
      if (result.error) throw result.error;
      const list = await client.from("pos_dining_options").select("id,name").eq("store_id", result.data.store_id).eq("is_active", true).order("sort_order");
      if (list.error) throw list.error;
      if (cancelled) return;
      const allowed = (list.data || []).filter(option => !/^VIP Booking(?:\s|$)/i.test(option.name));
      const current = [...allowed].sort((a,b) => b.name.length-a.name.length).find(option => String(result.data.dining_option || "").toLowerCase().startsWith(option.name.toLowerCase()));
      setOrder(result.data); setOptions(allowed); setOptionId(current?.id || "");
      setReference(current ? String(result.data.dining_option || "").slice(current.name.length).trim() : "");
    })().catch(err => { if (!cancelled) setError(err.message || "Unable to load this receipt."); });
    return () => { cancelled = true; };
  }, [receipt.id, receipt.order_id]);
  function change(update) { update(); key.current = null; setError(""); }
  async function save(event) {
    event.preventDefault();
    if (saving.current || !order || !selected) return;
    saving.current = true; setBusy(true); setError("");
    key.current ||= crypto.randomUUID();
    try {
      const { data, error: saveError } = await getSupabaseClient().rpc("change_pos_charged_dining_option", {
        p_request_id: key.current, p_order_id: order.id, p_option_id: optionId,
        p_reference: needsReference ? reference.trim() : "", p_reason: reason.trim(), p_expected_updated_at: order.updated_at,
      });
      if (saveError) throw saveError;
      await onSaved(data.order);
      onClose();
    } catch (err) { setError(err.message || "Unable to change dining option."); }
    finally { saving.current = false; setBusy(false); }
  }
  return <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-900/50 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="charged-dining-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
      <div className="flex items-center justify-between gap-3"><h2 id="charged-dining-title" className="text-lg font-bold">Change dining option</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Close dining option editor" className="rounded-lg border px-3 py-2">×</button></div>
      <p className="mt-2 text-sm text-slate-600">{receipt.receipt_number} · {order?.dining_option || "Loading receipt…"}</p>
      {bookingProtected && <p className="mt-3 text-sm text-amber-800">VIP booking receipts need a booking-assignment correction to protect the reservation credit.</p>}
      <form onSubmit={save} className="mt-4 space-y-3"><fieldset disabled={busy || !order || bookingProtected} className="space-y-3">
        <label className="block text-sm font-semibold">Dining option<select required value={optionId} onChange={event => change(() => { setOptionId(event.target.value); setReference(""); })} className="mt-1 h-11 w-full rounded-lg border bg-white px-3"><option value="">Select dining option</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
        {needsReference && <label className="block text-sm font-semibold">Order / room reference<input maxLength={80} required={/grab|shopee|panda/i.test(selected?.name || "")} value={reference} onChange={event => change(() => setReference(event.target.value))} className="mt-1 h-11 w-full rounded-lg border px-3" /></label>}
        <label className="block text-sm font-semibold">Reason<input required minLength={5} maxLength={500} value={reason} onChange={event => change(() => setReason(event.target.value))} className="mt-1 h-11 w-full rounded-lg border px-3" /></label>
        <p className="text-sm text-slate-600">Cup inventory follows the existing reusable/disposable cup rules. Payments stay as recorded. Existing KDS cards are relabeled.</p>
        <button type="submit" disabled={!optionId || reason.trim().length<5} className="h-11 w-full rounded-lg bg-slate-800 font-semibold text-white disabled:opacity-40">{busy ? "Saving…" : "Save dining option"}</button>
      </fieldset>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</form>
    </section>
  </div>;
}
