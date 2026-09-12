"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getSupabaseClient } from "@/lib/supabase/client";
import { giftCertificateValidUntil } from "@/lib/bookings/giftCertificateDates";
import { uploadProofFile } from "@/lib/storage/uploadProof";

const supabase = getSupabaseClient();
const inputClass = "mt-1 w-full rounded-xl border border-stone-300 bg-white p-3 text-stone-900";

export default function GiftCertificatePurchaseForm({ source = "website", storeId, onCreated, onBusyChange }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [method, setMethod] = useState("QRPH");
  const [file, setFile] = useState(null);
  const [cashReceived, setCashReceived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [purchase, setPurchase] = useState(null);
  const pending = useRef(null);
  const storageKey = useRef("");
  const submitting = useRef(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data, error: authError }) => {
      if (!mounted) return;
      const user = data?.user;
      setSignedIn(Boolean(user && !authError));
      if (user) {
        storageKey.current = `juja-gc-pending:${user.id}:${source}:${storeId || "web"}`;
        try {
          const saved = JSON.parse(sessionStorage.getItem(storageKey.current) || "null");
          if (saved) {
            pending.current = saved; setLocked(true); setName(saved.customer_name); setEmail(saved.customer_email);
            setQuantity(saved.quantity); setMethod(saved.payment_method); setCashReceived(saved.cash_received === true);
          } else if (source === "website") { setName(user.user_metadata?.full_name || ""); setEmail(user.email || ""); }
        } catch { /* Storage is optional; the in-memory reference still protects retries. */ }
      }
      setReady(true);
    }).catch(() => { if (mounted) { setReady(true); setError("Unable to check your login. Please reload."); } });
    return () => { mounted = false; };
  }, [source, storeId]);

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setBusy(true); onBusyChange?.(true); setError("");
    try {
      if (!pending.current) {
        if (method === "QRPH" && !file) throw new Error("Upload your QRPH payment proof.");
        if (method === "Cash" && !cashReceived) throw new Error("Confirm receipt of the full cash payment.");
        const proof = method === "QRPH" ? await uploadProofFile({ supabase, file, purpose: "payment-proofs" }) : null;
        pending.current = { request_key: crypto.randomUUID(), customer_name: name.trim(), customer_email: email.trim(),
          quantity: Number(quantity), source, store_id: storeId, payment_method: method, payment_proof_url: proof, cash_received: cashReceived };
        setLocked(true);
        try { sessionStorage.setItem(storageKey.current, JSON.stringify(pending.current)); } catch { /* In-memory fallback. */ }
      }
      const { data } = await supabase.auth.getSession();
      const response = await fetch("/api/gift-certificate-purchases", { method: "POST",
        headers: { "Content-Type": "application/json", ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
        body: JSON.stringify(pending.current) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 400 || response.status === 409) {
          pending.current = null; setLocked(false);
          try { sessionStorage.removeItem(storageKey.current); } catch { /* Optional storage. */ }
        }
        throw new Error(result.error || "Unable to submit. Retry the same request.");
      }
      setPurchase(result.purchase);
      try { sessionStorage.removeItem(storageKey.current); } catch { /* Optional storage. */ }
      onCreated?.(result.purchase);
    } catch (err) { setError(err.message); }
    finally { submitting.current = false; setBusy(false); onBusyChange?.(false); }
  }

  if (!ready) return <p className="p-4">Checking your account…</p>;
  if (!signedIn) return <div className="space-y-3 rounded-2xl border p-6"><p>Sign in to purchase e-GCs and upload payment proof.</p>
    <Link style={{ color: "#fff" }} className="inline-block rounded-xl bg-green-800 px-5 py-3 text-white" href="/customer/login?returnTo=%2Fgift-certificates">Sign in / Create account</Link>{error && <p role="alert">{error}</p>}</div>;
  if (purchase) return <div role="status" className="space-y-3 rounded-2xl border border-green-200 bg-green-50 p-6">
    <h2 className="text-xl font-semibold">{purchase.status === "approved" ? "Purchase approved" : purchase.status === "rejected" ? "Purchase needs assistance" : "Purchase submitted for admin approval"}</h2>
    <p>{purchase.quantity} × ₱100 e-GCs · Total ₱{Number(purchase.amount).toLocaleString()}</p>
    <p>Customer: {purchase.customer_name}<br />Email: {purchase.customer_email}</p>
    <p className="break-all text-sm">Reference: {purchase.id}</p>
    {purchase.expires_at && <p className="font-semibold">Valid until: {giftCertificateValidUntil(purchase.expires_at)} (Philippine time)</p>}
    <p>After payment verification and admin approval, the certificate images and scannable barcodes will be emailed to the customer. Valid for six months from creation.</p>
    <button type="button" onClick={() => { pending.current = null; setLocked(false); setPurchase(null); setFile(null); setCashReceived(false); setName(""); setEmail(""); setQuantity(1); }} className="rounded-lg border border-green-800 px-4 py-2 text-green-800">Start another purchase</button>
    {purchase.rejection_reason && <p>{purchase.rejection_reason} Please contact JUJA for assistance with the payment.</p>}
  </div>;

  return <form onSubmit={submit} className="space-y-5">
    <p className="text-stone-600">₱100 per certificate · Valid for six months from creation. Admin approval is required before email delivery.</p>
    <fieldset disabled={busy || locked} className="space-y-4 disabled:opacity-70">
      <label className="block text-sm font-semibold">Customer full name<input className={inputClass} required minLength={2} maxLength={150} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="block text-sm font-semibold">Customer email<input className={inputClass} type="email" required maxLength={254} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /><span className="mt-1 block font-normal text-stone-500">Approved e-GCs will be sent here. Please check the spelling.</span></label>
      <label className="block text-sm font-semibold">Number of ₱100 e-GCs<select className={inputClass} value={quantity} onChange={e => { setQuantity(Number(e.target.value)); setCashReceived(false); }}>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} — ₱{(i + 1) * 100}</option>)}</select></label>
      {source === "pos" && <label className="block text-sm font-semibold">Payment method<select className={inputClass} value={method} onChange={e => { setMethod(e.target.value); setCashReceived(false); }}><option>QRPH</option><option>Cash</option></select></label>}
      {method === "QRPH" ? <div className="space-y-3 rounded-xl bg-stone-50 p-4">
        <p className="font-semibold">Pay exactly ₱{quantity * 100} using QRPH</p>
        <Image src="https://files.jujabrewandbites.com/public-media/qrph.jpg" alt="JUJA QRPH payment code" width={320} height={400} unoptimized className="mx-auto h-auto max-h-96 w-auto max-w-full" />
        <a href="https://files.jujabrewandbites.com/public-media/qrph.jpg" target="_blank" rel="noopener noreferrer" className="block text-center text-green-800 underline">Open payment QR</a>
        <label className="block text-sm font-semibold">Payment proof<input className={inputClass} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required={!locked} onChange={e => setFile(e.target.files?.[0] || null)} /></label>
        <p className="text-xs text-stone-500">JPG, PNG, WebP or PDF, up to 10 MB. Submit each payment proof only once.</p>
      </div> : <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-4"><input type="checkbox" required checked={cashReceived} onChange={e => setCashReceived(e.target.checked)} className="mt-1" /><span>I received the full ₱{quantity * 100} cash payment. Any change has already been returned.</span></label>}
    </fieldset>
    {locked && <p className="text-sm text-amber-800">This reference is saved. Retry to confirm its status without creating another purchase.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button disabled={busy} className="w-full rounded-xl bg-green-800 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Submitting…" : locked ? "Retry saved purchase" : `Submit ₱${quantity * 100} purchase for approval`}</button>
  </form>;
}
