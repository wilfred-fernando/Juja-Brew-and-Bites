"use client";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function BookingCustomerSelector({ value, onChange, disabled }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setRows([]); setError(""); setLoading(false);
    if (query.trim().length < 2 || value) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await getSupabaseClient().auth.getSession();
        if (controller.signal.aborted) return;
        const response = await fetch(`/api/bookings/customers?q=${encodeURIComponent(query)}`, { signal: controller.signal, headers: { Authorization: `Bearer ${data.session?.access_token || ""}` } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!controller.signal.aborted) setRows(result.customers);
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, value]);
  return <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
    <p className="text-sm font-semibold text-slate-700">Customer account <span className="font-normal text-slate-500">(optional)</span></p>
    {value ? <div className="mt-2 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{value.name}</p><p className="text-xs text-slate-500">{value.email} · {value.phone}</p></div><button type="button" disabled={disabled} onClick={() => { onChange(null); setQuery(""); }} className="rounded-lg border bg-white px-3 py-2 text-xs">Remove tag</button></div> : <>
      <input aria-label="Search customer accounts" disabled={disabled} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email or phone" className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
      <p className="mt-1 text-xs text-slate-500">Leave blank for a guest booking.</p>
      {loading && <p role="status" className="mt-2 text-xs">Searching…</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      {!loading && !error && query.trim().length >= 2 && rows.length === 0 && <p className="mt-2 text-xs text-slate-500">No linked customer accounts found.</p>}
      <div className="max-h-44 overflow-y-auto">{rows.map((row) => <button type="button" key={row.id} disabled={disabled} onClick={() => onChange(row)} className="mt-2 block w-full rounded-lg border border-slate-200 bg-white p-3 text-left hover:bg-slate-100"><p className="text-sm font-semibold">{row.name}</p><p className="text-xs text-slate-500">{row.email} · {row.phone}</p></button>)}</div>
    </>}
  </div>;
}
