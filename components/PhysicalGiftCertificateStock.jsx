"use client";
import { useEffect, useRef, useState } from "react";
import GiftCertificatePurchaseForm from "./GiftCertificatePurchaseForm";
import { GIFT_CERTIFICATE_PAYMENT_BRANCHES } from "@/lib/giftCertificatePaymentQr";

const endpoint = "/api/admin/physical-gift-certificates";
export default function PhysicalGiftCertificateStock() {
  const [quantity, setQuantity] = useState(1);
  const [batches, setBatches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [storeId, setStoreId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const request = useRef(null);
  async function refresh() {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setBatches(data.batches || []);
    } catch (err) { setError(err.message); }
  }
  useEffect(() => { refresh(); }, []);
  async function generate() {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    request.current ||= { action: "generate", request_key: crypto.randomUUID(), quantity };
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request.current) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage(`${request.current.quantity} physical certificates generated. They are inactive until sold.`);
      request.current = null;
      await refresh();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-xl border bg-white p-5">
    <h2 className="text-xl font-semibold">Physical gift certificate stock</h2>
    <p>Generate ₱100 certificates for printing. Unsold codes cannot be redeemed. Record payment below to activate each certificate for six months. No email is sent.</p>
    <div className="flex flex-wrap items-end gap-3"><label>Quantity (1–100)<input type="number" min="1" max="100" disabled={busy || Boolean(request.current)} value={quantity} onChange={e => setQuantity(Number(e.target.value))} className="ml-2 w-24 rounded border p-2" /></label><button type="button" disabled={busy || !Number.isInteger(quantity) || quantity < 1 || quantity > 100} onClick={generate} className="rounded bg-green-800 px-4 py-2 text-white">{busy ? "Generating…" : request.current ? "Retry generation" : "Generate unsold stock"}</button><button type="button" onClick={refresh} className="rounded border px-4 py-2">Refresh stock</button></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}{message && <p role="status">{message}</p>}
    <div className="max-h-96 space-y-2 overflow-auto">{batches.map(batch => <div key={batch.id} className="flex flex-wrap items-center gap-3 rounded border p-3"><span className="font-mono">{batch.booking_gc_certificates[0]?.code}</span><span>₱100 · Unsold / inactive</span><a className="text-green-800 underline" target="_blank" rel="noopener noreferrer" href={`/api/admin/booking-cancellation-gift-certificate?certificateId=${batch.booking_gc_certificates[0]?.id}&download=1`}>Download for printing</a><button type="button" disabled={busy} onClick={() => { setSelected(batch); setStoreId(""); }} className="rounded border px-3 py-2">Record paid sale</button></div>)}</div>
    {selected && <div className="space-y-4 border-t pt-4"><h3 className="font-semibold">Sell {selected.booking_gc_certificates[0]?.code}</h3><label>Sale branch<select disabled={busy} value={storeId} onChange={e => setStoreId(e.target.value)} className="ml-2 rounded border p-2"><option value="">Select branch</option>{GIFT_CERTIFICATE_PAYMENT_BRANCHES.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>{storeId && <GiftCertificatePurchaseForm key={`${selected.id}:${storeId}`} source="pos" storeId={storeId} stockBatchId={selected.id} onBusyChange={setBusy} onCreated={() => { setSelected(null); setMessage("Paid sale recorded. The physical certificate is now active; no email was sent."); refresh(); }} />}</div>}
  </section>;
}
