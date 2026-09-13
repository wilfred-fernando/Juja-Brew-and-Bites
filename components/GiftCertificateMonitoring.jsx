"use client";

import { useEffect, useState } from "react";
import BookingGiftCertificates from "@/components/BookingGiftCertificates";
import { giftCertificateValidUntil } from "@/lib/bookings/giftCertificateDates";

const labels = { total: "All certificates", available: "Available", pending_approval: "Pending approval", redeemed: "Redeemed / applied online", expired: "Expired", rejected: "Rejected" };
const money = value => `₱${Number(value || 0).toLocaleString("en-PH")}`;
const date = value => value ? new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) : "—";
const control = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

export default function GiftCertificateMonitoring() {
  const [tab, setTab] = useState("monitor");
  const [filters, setFilters] = useState({ search: "", source: "", status: "", email: "", page: 1 });
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    setBusy(true);
    setSelected(null);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/gift-certificates?${new URLSearchParams(filters)}`, { signal: abort.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setData(result); setError("");
      } catch (err) { if (err.name !== "AbortError") { setError(err.message); setData(null); } }
      finally { if (!abort.signal.aborted) setBusy(false); }
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [filters, revision]);
  useEffect(() => {
    setHistory(null); setHistoryError("");
    if (!selected) return;
    const abort = new AbortController();
    (async () => {
      try {
        const response = await fetch(`/api/admin/gift-certificates?certificateId=${selected.id}`, { signal: abort.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setHistory(result);
      } catch (err) { if (err.name !== "AbortError") setHistoryError(err.message); }
    })();
    return () => abort.abort();
  }, [selected]);
  const filter = (key, value) => setFilters(previous => ({ ...previous, [key]: value, page: 1 }));
  const batch = selected?.booking_gc_batches;
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-2" aria-label="e-GC sections">
      {[["monitor", "Monitoring"], ["booking", "Cancellation approvals"], ["purchase", "Purchase approvals"]].map(([key, label]) => <button type="button" key={key} aria-pressed={tab === key} className={`${control} ${tab === key ? "!bg-green-800 text-white" : ""}`} onClick={() => { setTab(key); if (key === "monitor") setRevision(value => value + 1); }}>{label}</button>)}
    </div>
    {tab !== "monitor" ? <BookingGiftCertificates key={tab} source={tab} onApproved={() => setRevision(value => value + 1)} /> : <>
      <div className="flex flex-wrap gap-3">
        <input aria-label="Search certificates" className={`${control} min-w-64 flex-1`} placeholder="Code, customer, email or reference" value={filters.search} onChange={event => filter("search", event.target.value)} />
        <select aria-label="Certificate source" className={control} value={filters.source} onChange={event => filter("source", event.target.value)}><option value="">All sources</option><option value="booking">Booking cancellation</option><option value="purchase">Purchase</option></select>
        <select aria-label="Certificate status" className={control} value={filters.status} onChange={event => filter("status", event.target.value)}><option value="">All statuses</option>{Object.entries(labels).filter(([key]) => key !== "total").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <select aria-label="Email status" className={control} value={filters.email} onChange={event => filter("email", event.target.value)}><option value="">All email statuses</option>{["pending", "sending", "sent", "failed"].map(value => <option key={value} value={value}>Email: {value}</option>)}</select>
        <button type="button" className={control} disabled={busy} onClick={() => setRevision(value => value + 1)}>Refresh</button>
      </div>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {busy && <p role="status">Loading certificates…</p>}
      {data && !busy && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{Object.entries(labels).filter(([key]) => key !== "total").map(([key, label]) => <div key={key} className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-600">{label}</p><p className="text-2xl font-semibold">{data.totals[key]}</p><p className="text-sm">{money(data.values[key])}</p></div>)}<div className="rounded-xl border bg-white p-4"><p className="text-sm">All certificates</p><p className="text-2xl font-semibold">{data.totals.total}</p><p>{money(data.values.total)}</p></div></div>
        <p className="text-xs text-slate-600">Totals follow search, source and email filters, across all certificate statuses. Values are face values; available certificates can be redeemed once. Dates use Philippine time.</p>
        <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr>{["Certificate", "Customer", "Source", "Status", "Email", "Valid until", "Details"].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr key={row.id} className="border-t"><td className="p-3 whitespace-nowrap font-mono">{row.code}<span className="block font-sans">{money(row.amount)}</span></td><td className="p-3">{row.booking_gc_batches.customer_name}<span className="block text-xs">{row.booking_gc_batches.customer_email}</span></td><td className="p-3">{row.booking_gc_batches.purchase_id ? "Purchase" : "Cancellation"}</td><td className="p-3">{labels[row.state]}</td><td className="p-3">{row.booking_gc_batches.email_status}</td><td className="p-3 whitespace-nowrap">{giftCertificateValidUntil(row.booking_gc_batches.expires_at)}</td><td className="p-3"><button type="button" className={control} onClick={() => setSelected(row)}>View</button></td></tr>)}</tbody></table>{!data.rows.length && <p className="p-5">No certificates match these filters.</p>}</div>
        <div className="flex items-center justify-between gap-3 text-sm"><span>{data.count} certificates · Page {data.page} of {data.pages}</span><div className="flex gap-2"><button type="button" className={control} disabled={data.page <= 1} onClick={() => setFilters(previous => ({ ...previous, page: data.page - 1 }))}>Previous</button><button type="button" className={control} disabled={data.page >= data.pages} onClick={() => setFilters(previous => ({ ...previous, page: data.page + 1 }))}>Next</button></div></div>
      </>}
      {selected && <section className="space-y-3 rounded-xl border bg-white p-5" aria-label="Certificate details"><div className="flex justify-between gap-3"><h2 className="break-all font-semibold">{selected.code}</h2><button type="button" className={control} onClick={() => setSelected(null)}>Close</button></div>
        <p>{batch.customer_name} · {batch.customer_email}</p><p className="break-all">{batch.purchase_id ? "Purchase" : "Booking"} reference: {batch.purchase_id || batch.booking_id}</p>
        <p>Created: {date(batch.created_at)} · Approved: {date(batch.approved_at)} · Email sent: {date(batch.emailed_at)}</p>
        <p>Approval: {batch.status.replaceAll("_", " ")} · Email: {batch.email_status} · Valid until: {giftCertificateValidUntil(batch.expires_at)}</p>
        {batch.email_error && <p className="text-red-700">Email issue: {batch.email_error}</p>}
        <a className="inline-block text-green-800 underline" target="_blank" rel="noopener noreferrer" href={`/api/admin/booking-cancellation-gift-certificate?certificateId=${selected.id}`}>Open certificate image</a>
        <h3 className="font-semibold">Redemption history</h3>
        {historyError && <p role="alert" className="text-red-700">{historyError}</p>}
        {!history && !historyError && <p>Loading history…</p>}
        {history && <>{!history.redemptions.length && <p>No current redemption.</p>}{history.redemptions.map(entry => <div key={entry.certificate_id} className="space-y-1 rounded-lg bg-green-50 p-3 text-sm"><p>{entry.order_id ? "Redeemed at POS" : "Applied to online order"} · {money(entry.amount)} · {date(entry.redeemed_at)}</p><p>Branch: {entry.store_id}</p>{entry.receipt_number && <p>Receipt: {entry.receipt_number}</p>}{entry.web_order_id && <p className="break-all">Online order: {entry.web_order_id}</p>}{entry.order_id && <p className="break-all">POS order: {entry.order_id}</p>}</div>)}{history.releases.map(entry => <div key={entry.id} className="rounded-lg bg-amber-50 p-3 text-sm"><p>Returned after online cancellation · {money(entry.amount)} · {date(entry.released_at)}</p><p className="break-all">Online order: {entry.web_order_id}</p><p>Reason: {entry.reason}</p></div>)}</>}
      </section>}
    </>}
  </div>;
}
