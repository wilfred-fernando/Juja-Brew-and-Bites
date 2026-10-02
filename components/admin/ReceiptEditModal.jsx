"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { buildReceiptCorrection, isGiftCertificatePayment, receiptPaymentSplits, RECEIPT_PAYMENT_METHODS } from "@/lib/reports/receiptCorrections";
import { peso, displayDateTime } from "@/lib/reports/salesReports";

async function adminRequest(url, options = {}) {
  const { data } = await getSupabaseClient().auth.getSession();
  const response = await fetch(url, { ...options, cache: "no-store", headers: {
    "Content-Type": "application/json", ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}), ...options.headers,
  } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Unable to save receipt.");
  return payload;
}

export default function ReceiptEditModal({ order, onClose, onSaved }) {
  const [context, setContext] = useState(null);
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [history, setHistory] = useState([]);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const source = order.source === "POS" ? "order" : "web_order";

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ source, id: order.id, date: order.date });
    adminRequest(`/api/admin/receipt-corrections?${params}`).then((payload) => {
      if (cancelled) return;
      const discount = payload.context.receipt.source_metadata?.admin_receipt_discount || {};
      const payments = receiptPaymentSplits(payload.context.receipt);
      setContext(payload.context);
      setSelectedMember(payload.member);
      setMembers(payload.member ? [payload.member] : []);
      setHistory(payload.history || []);
      setDraft({ memberId: payload.member?.id || "", discountType: discount.type || "amount", discountValue: discount.value || "",
        discountName: discount.name || "", payments, reason: "" });
    }).catch((err) => { if (!cancelled) setError(err.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [order.id, order.date, source]);

  useEffect(() => {
    if (!context) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      adminRequest(`/api/admin/receipt-corrections?action=members&q=${encodeURIComponent(memberSearch)}`)
        .then((payload) => { if (!cancelled) setMembers(payload.members || []); })
        .catch((err) => { if (!cancelled) setError(err.message); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [context, memberSearch]);

  const preview = useMemo(() => {
    if (!context || !draft) return null;
    try { return { result: buildReceiptCorrection(context, draft) }; }
    catch (err) { return { error: err.message }; }
  }, [context, draft]);
  const update = (values) => {
    setDraft((previous) => ({ ...previous, ...values }));
    setRequestId(crypto.randomUUID());
    setError("");
  };
  const memberOptions = selectedMember && !members.some((row) => row.id === selectedMember.id) ? [selectedMember, ...members] : members;
  const paymentOptions = [...new Set([...RECEIPT_PAYMENT_METHODS, ...(draft?.payments || []).map((row) => row.method)])];
  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

  async function save(event) {
    event.preventDefault();
    if (!context || !draft || saving || preview?.error) return;
    setSaving(true); setError("");
    try {
      const result = await adminRequest("/api/admin/receipt-corrections", { method: "POST", body: JSON.stringify({
        ...draft, source, id: order.id, date: order.date, version: context.version, requestId,
      }) });
      await onSaved(result);
    } catch (err) { setError(err.message); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-3" onClick={() => { if (!saving) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="receipt-edit-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="receipt-edit-title" className="text-lg font-semibold text-slate-900">Edit receipt {order.orderNumber}</h2>
          <button type="button" disabled={saving} onClick={onClose} aria-label="Close receipt editor" className="rounded-lg px-3 py-2 text-slate-700">×</button>
        </div>
        {loading ? <p className="py-8 text-sm text-slate-600">Loading receipt details…</p> : draft && (
          <form onSubmit={save} className="mt-4 space-y-4">
            <fieldset disabled={saving} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Find loyalty account
                  <input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Name, account code, or phone" className={inputClass} />
                </label>
                <label className="mt-2 block text-sm font-medium text-slate-700">Loyalty account
                  <select value={draft.memberId} onChange={(event) => { update({ memberId: event.target.value }); setSelectedMember(memberOptions.find((row) => row.id === event.target.value) || null); }} className={inputClass}>
                    <option value="">No loyalty account</option>
                    {memberOptions.map((row) => <option key={row.id} value={row.id}>{row.customer_name} · {row.customer_code || row.Phone || row.id.slice(0, 8)}</option>)}
                  </select>
                </label>
                {draft.memberId && <button type="button" onClick={() => { update({ memberId: "" }); setSelectedMember(null); }} className="mt-2 text-xs font-semibold text-rose-700">Remove account from receipt</button>}
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-800">Additional receipt discount</p>
                <p className="mt-1 text-xs text-slate-600">Existing item discounts and vouchers remain included.</p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <label className="text-sm text-slate-700">Type<select value={draft.discountType} onChange={(event) => update({ discountType: event.target.value })} className={inputClass}><option value="amount">Amount (₱)</option><option value="percent">Percentage (%)</option></select></label>
                  <label className="text-sm text-slate-700">Value<input type="number" min="0" step="0.01" value={draft.discountValue} onChange={(event) => update({ discountValue: event.target.value })} className={inputClass} /></label>
                </div>
                <label className="mt-2 block text-sm text-slate-700">Discount label<input maxLength={100} value={draft.discountName} onChange={(event) => update({ discountName: event.target.value })} placeholder="e.g. Customer service discount" className={inputClass} /></label>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-800">Payment type</p>
                {draft.payments.map((payment, index) => {
                  const gift = isGiftCertificatePayment(payment.method);
                  return <div key={index} className="mt-2 flex items-end gap-2">
                    <label className="min-w-0 flex-1 text-xs text-slate-700">Method<select disabled={gift} value={payment.method} onChange={(event) => update({ payments: draft.payments.map((row, i) => i === index ? { ...row, method: event.target.value } : row) })} className={inputClass}>{paymentOptions.filter((method) => gift || !isGiftCertificatePayment(method)).map((method) => <option key={method} value={method}>{method}</option>)}</select></label>
                    {draft.payments.length > 1 && <label className="w-28 text-xs text-slate-700">Amount<input disabled={gift} type="number" min="0" step="0.01" value={payment.amount} onChange={(event) => update({ payments: draft.payments.map((row, i) => i === index ? { ...row, amount: event.target.value } : row) })} className={inputClass} /></label>}
                    {draft.payments.length > 1 && !gift && <button type="button" onClick={() => update({ payments: draft.payments.filter((_, i) => i !== index) })} className="pb-2 text-xs font-semibold text-rose-700" aria-label={`Remove ${payment.method} payment`}>Remove</button>}
                  </div>;
                })}
                <button type="button" onClick={() => update({ payments: [...draft.payments, { method: RECEIPT_PAYMENT_METHODS.find((method) => !draft.payments.some((row) => row.method === method)) || "Cash", amount: 0 }] })} className="mt-3 text-xs font-semibold text-cyan-800">Add split payment</button>
                {draft.payments.some((row) => isGiftCertificatePayment(row.method)) && <p className="mt-2 text-xs text-slate-600">Gift certificate amounts retain their recorded redemption value.</p>}
              </div>
              <label className="block text-sm font-medium text-slate-700">Correction reason<textarea required minLength={3} maxLength={500} value={draft.reason} onChange={(event) => update({ reason: event.target.value })} className={inputClass} placeholder="Explain why this receipt is being corrected" /></label>
            </fieldset>
            {preview?.result ? <div className="flex justify-between rounded-xl bg-slate-100 p-3 text-sm text-slate-900"><span>Total discount: {peso(preview.result.discount)}</span><strong>Corrected total: {peso(preview.result.net)}</strong></div> : <p role="status" className="text-sm text-amber-800">{preview?.error}</p>}
            <p className="text-xs text-slate-600">Saving updates loyalty points and spending, receipt details, sales totals, payment reports, and shift reports.</p>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={saving} onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="submit" disabled={saving || !!preview?.error || draft.reason.trim().length < 3} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save receipt"}</button>
            </div>
          </form>
        )}
        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        {history.length > 0 && <div className="mt-5 border-t border-slate-200 pt-3"><p className="text-xs font-semibold text-slate-700">Correction history</p>{history.map((entry) => <p key={entry.request_id} className="mt-2 text-xs text-slate-600">{displayDateTime(entry.created_at)} · {entry.reason}</p>)}</div>}
      </section>
    </div>
  );
}
