"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { giftCertificateValidUntil } from "@/lib/bookings/giftCertificateDates";

const endpoint = "/api/admin/booking-cancellation-gift-certificate";

export default function BookingGiftCertificates({ bookings, onApproved, source = "booking" }) {
  const [batches, setBatches] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [message, setMessage] = useState("");

  const [paymentVerified, setPaymentVerified] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [reason, setReason] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${endpoint}?source=${source}&history=${showHistory ? "1" : "0"}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load gift certificates.");
      setBatches(data.batches || []);
      setError("");
    } catch (err) { setError(err.message); }
  }, [source, showHistory]);

  useEffect(() => { refresh(); }, [bookings, refresh]);

  async function approve(batch, action = "approve_email") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: batch.id, action, paymentVerified, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to approve certificates.");
      setMessage(action === "reject_purchase" ? "Purchase rejected. If money was collected, arrange a refund with the customer separately." : "Certificates approved and email sent to the customer.");
      await refresh();
      onApproved?.();
    } catch (err) {
      await refresh();
      setError(err.message);
    } finally { setBusy(false); }
  }

  const selected = batches.find((batch) => batch.id === selectedId);
  const eligible = selected && (selected.purchase_id ? selected.status !== "rejected" : ["cancelled", "canceled", "cancelled_gc", "cancellation_requested"].includes(selected.function_room_bookings?.status));
  const exactAmount = selected && Number(selected.amount) % 100 === 0;
  const expired = selected && new Date(selected.expires_at).getTime() <= Date.now();

  return (
    <section className="my-5 rounded-2xl border border-amber-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-800">{source === "purchase" ? "Purchased e-Gift Certificates" : "Cancellation e-Gift Certificates"}</h2>
          <p className="text-sm text-slate-600">₱100 per certificate. Review the email, then approve and send to the customer.</p>
        </div>
        <button type="button" disabled={busy} onClick={refresh} className="rounded-lg border px-3 py-2 text-sm">Refresh</button>
      </div>
      {source === "purchase" && <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={showHistory} onChange={e => setShowHistory(e.target.checked)} />Include rejected purchases</label>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-3 text-sm text-green-700">{message}</p>}
      {!batches.length && !error && <p className="mt-3 text-sm text-slate-500">No certificates to review.</p>}
      <div className="mt-3 max-h-64 space-y-2 overflow-auto">
        {batches.map((batch) => (
          <button key={batch.id} type="button" disabled={busy} onClick={() => { setSelectedId(batch.id); setPaymentVerified(false); setReason(""); }}
            className={`block w-full rounded-lg border p-3 text-left text-sm ${selectedId === batch.id ? "border-green-700 bg-green-50" : "border-slate-200"}`}>
            <strong>{batch.customer_name || "Customer"}</strong> · ₱{Number(batch.amount).toLocaleString()} · {batch.booking_gc_certificates.length} certificates
            <span className="block text-xs text-slate-600">{batch.customer_email || "Missing email"} · {batch.status.replaceAll("_", " ")} · Email: {batch.email_status}</span>
          </button>
        ))}
      </div>
      {selected && (
        <div className="mt-4 border-t pt-4">
          {selected.gc_purchases && <div className="mb-4 space-y-2 rounded-lg bg-amber-50 p-4 text-sm">
            <p className="break-all"><strong>Purchase reference:</strong> {selected.purchase_id}</p>
            <p><strong>Source:</strong> {selected.gc_purchases.source} · <strong>Payment:</strong> {selected.gc_purchases.payment_method} · ₱{Number(selected.amount).toLocaleString()}</p>
            {selected.gc_purchases.store_id && <p>Branch: {selected.gc_purchases.store_id}</p>}
            <p>Created: {new Date(selected.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</p>
            {selected.gc_purchases.payment_proof_url && <a href={selected.gc_purchases.payment_proof_url} target="_blank" rel="noopener noreferrer" className="inline-block text-green-800 underline">Open payment proof</a>}
            {selected.gc_purchases.rejection_reason && <p className="text-red-700">Reason: {selected.gc_purchases.rejection_reason}</p>}
            {selected.status === "pending_approval" && <label className="flex items-start gap-2"><input type="checkbox" disabled={busy} checked={paymentVerified} onChange={e => setPaymentVerified(e.target.checked)} className="mt-1" /><span>I verified the full payment and checked the customer name and email.</span></label>}
          </div>}
          <h3 className="font-semibold">Customer email draft</h3>
          <p className="mt-2 text-sm">To: {selected.customer_email || "Missing email"}</p>
          <p className="text-sm">Subject: {selected.email.subject}</p>
          <pre className="my-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-sans text-sm">{selected.email.text}</pre>
          <p className="text-sm font-semibold">Valid until: {giftCertificateValidUntil(selected.expires_at)} (Philippine time)</p>
          <details className="my-3">
            <summary className="cursor-pointer text-sm font-semibold">Preview certificate images ({selected.booking_gc_certificates.length})</summary>
            <div className="mt-3 max-h-[36rem] space-y-4 overflow-auto">
              {selected.booking_gc_certificates.map((gc) => <div key={`${gc.id}-${selected.status}-${gc.status}`}>
                <Image src={`${endpoint}?certificateId=${gc.id}&state=${selected.status}-${gc.status}`} alt={`JUJA e-GC ${gc.code}`} width={1774} height={887} unoptimized className="h-auto w-full rounded-lg border" />
                <a href={`${endpoint}?certificateId=${gc.id}&download=1`} className="mt-1 inline-block text-sm text-green-800 underline">Download {gc.code}</a>
              </div>)}
            </div>
          </details>
          <details className="mb-3 text-sm">
            <summary className="cursor-pointer font-semibold">Certificate usage</summary>
            {selected.booking_gc_certificates.map((gc) => <p key={gc.id} className="mt-2 break-all">
              {gc.code} · {gc.status.replaceAll("_", " ")}{gc.redeemed_at ? ` · ${new Date(gc.redeemed_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}` : ""}
            </p>)}
          </details>
          {!eligible && <p className="text-sm text-red-700">{selected.purchase_id ? "This purchase was rejected. Approval is blocked." : "This booking is no longer cancelled or awaiting cancellation. Approval is blocked."}</p>}
          {expired && <p className="text-sm text-red-700">These certificates have expired and cannot be approved, emailed, or redeemed.</p>}
          {!exactAmount && <p className="text-sm text-red-700">The reservation fee is not divisible by ₱100. The remaining balance needs review before approval.</p>}
          {selected.email_status === "sending" && <p className="text-sm text-amber-800">Sending or awaiting delivery verification. If this persists, verify delivery with support before attempting another send.</p>}
          {selected.email_error && <p className="text-sm text-red-700">{selected.email_error}</p>}
          <button type="button" onClick={() => approve(selected)}
            disabled={busy || (selected.purchase_id && selected.status !== "approved" && !paymentVerified) || expired || !eligible || !exactAmount || !selected.customer_email || ["sending", "sent"].includes(selected.email_status)}
            className="mt-3 rounded-lg bg-green-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? "Processing…" : selected.email_status === "sent" ? "Email sent" : selected.status === "approved" ? "Retry customer email" : "Approve certificates & send email"}
          </button>
          {selected.purchase_id && selected.status === "pending_approval" && <div className="mt-4 border-t pt-3">
            <label className="block text-sm">Rejection reason<input value={reason} disabled={busy} maxLength={500} onChange={e => setReason(e.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
            <p className="mt-1 text-xs text-slate-500">Rejection blocks issuance. It does not refund a payment; arrange any required refund separately.</p>
            <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => approve(selected, "reject_purchase")} className="mt-2 rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 disabled:opacity-40">Reject purchase</button>
          </div>}
        </div>
      )}
    </section>
  );
}
