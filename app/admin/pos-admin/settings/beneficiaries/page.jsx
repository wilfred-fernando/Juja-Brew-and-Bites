"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const ENDPOINT = "/api/admin/discount-beneficiaries";

const timestampFormat = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  year: "numeric", month: "short", day: "2-digit",
  hour: "numeric", minute: "2-digit", hour12: true,
});

function beneficiaryTimestamp(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? timestampFormat.format(date) : "—";
}

async function beneficiaryRequest(url, options = {}) {
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data?.session?.access_token;
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to complete the request.");
  return result;
}

export default function BeneficiariesPage() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState("");
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ q: query, type, status, page: String(page) });
    beneficiaryRequest(`${ENDPOINT}?${params}`, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
        if (page > lastPage) { setPage(lastPage); return; }
        setRows(result.beneficiaries);
        setTotal(result.total);
        setPageSize(result.pageSize);
      })
      .catch((error) => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, type, status, page, revision]);

  async function save(event) {
    event.preventDefault();
    if (saving || !editing) return;
    setSaving(true);
    setSaveError("");
    setSuccess("");
    try {
      await beneficiaryRequest(ENDPOINT, { method: "PATCH", body: JSON.stringify({
        id: editing.id,
        full_name: editing.full_name,
        id_number: editing.id_number,
        beneficiary_type: editing.beneficiary_type,
        updated_at: editing.updated_at,
      }) });
      setEditing(null);
      setSuccess("Beneficiary details updated.");
      setRevision((value) => value + 1);
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(row) {
    if (deletingId || !window.confirm(`Delete ${row.full_name}? This cannot be undone.`)) return;
    setDeletingId(row.id);
    setError("");
    setSuccess("");
    try {
      await beneficiaryRequest(ENDPOINT, { method: "DELETE", body: JSON.stringify({ id: row.id, updated_at: row.updated_at }) });
      setSuccess(`${row.full_name} deleted.`);
      setRevision((value) => value + 1);
    } catch (error) {
      setError(error.message);
    } finally {
      setDeletingId("");
    }
  }

  const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100";
  const buttonClass = "rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40";
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">SC / PWD Beneficiaries</h1>
        <p className="mt-1 text-sm text-slate-600">Review and correct beneficiary details saved from POS across all stores.</p>
        <p className="mt-1 text-xs text-slate-500">Times used counts completed receipts across all dates and stores. Multiple discounted items on one receipt count as one use.</p>
      </header>

      {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}

      {editing && (
        <form onSubmit={save} className="space-y-4 rounded-2xl border border-cyan-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-800">Edit beneficiary</h2>
          <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold sm:col-span-2">
              <span>Full name</span>
              <input autoFocus required minLength={3} maxLength={200} value={editing.full_name} onChange={(event) => setEditing({ ...editing, full_name: event.target.value })} className={inputClass} />
            </label>
            <label className="space-y-1 text-sm font-semibold">
              <span>Beneficiary type</span>
              <select value={editing.beneficiary_type} onChange={(event) => setEditing({ ...editing, beneficiary_type: event.target.value })} className={inputClass}>
                <option value="senior_citizen">SC (Senior Citizen)</option>
                <option value="pwd">PWD</option>
              </select>
            </label>
            <label className="space-y-1 text-sm font-semibold">
              <span>ID number</span>
              <input required maxLength={100} value={editing.id_number} onChange={(event) => setEditing({ ...editing, id_number: event.target.value })} className={inputClass} />
            </label>
          </fieldset>
          {saveError && <p role="alert" className="text-sm text-red-700">{saveError}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">{saving ? "Saving..." : "Save changes"}</button>
            <button type="button" disabled={saving} onClick={() => { setEditing(null); setSaveError(""); }} className={buttonClass}>Cancel</button>
          </div>
        </form>
      )}

      <form onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); setPage(1); setRevision((value) => value + 1); }} className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="min-w-48 flex-1 space-y-1 text-sm font-semibold">
          <span>Search name or ID number</span>
          <input value={search} maxLength={120} onChange={(event) => setSearch(event.target.value)} placeholder="Name or ID number" className={inputClass} />
        </label>
        <label className="space-y-1 text-sm font-semibold">
          <span>Type</span>
          <select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className={inputClass}>
            <option value="">All types</option><option value="senior_citizen">SC</option><option value="pwd">PWD</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-semibold">
          <span>Status</span>
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className={inputClass}>
            <option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All statuses</option>
          </select>
        </label>
        <button type="submit" disabled={loading} className={buttonClass}>Search</button>
        <button type="button" disabled={loading || saving} onClick={() => setRevision((value) => value + 1)} className={buttonClass}>Refresh</button>
      </form>

      {error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p> : loading ? (
        <p role="status" className="p-4 text-sm text-slate-600">Loading beneficiaries...</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr>
                <th scope="col" className="px-4 py-3">Full name</th><th scope="col" className="px-4 py-3">Type</th><th scope="col" className="px-4 py-3">ID number</th><th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="whitespace-nowrap px-4 py-3 text-right">Times used</th>
                <th scope="col" className="px-4 py-3">Created <span className="block text-xs font-normal">Philippine time</span></th>
                <th scope="col" className="px-4 py-3">Updated <span className="block text-xs font-normal">Philippine time</span></th>
                <th scope="col" className="px-4 py-3">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => <tr key={row.id}>
                  <td className="px-4 py-3 font-semibold">{row.full_name}</td>
                  <td className="whitespace-nowrap px-4 py-3">{row.beneficiary_type === "pwd" ? "PWD" : "SC"}</td>
                  <td className="px-4 py-3">{row.id_number}</td>
                  <td className="px-4 py-3 text-slate-500">{row.is_active ? "Active" : "Inactive"}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{Number(row.times_used || 0).toLocaleString("en-PH")}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{beneficiaryTimestamp(row.created_at)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{beneficiaryTimestamp(row.updated_at)}</td>
                  <td className="px-4 py-3"><div className="flex gap-2">
                    <button type="button" disabled={!!editing || !!deletingId} aria-label={`Edit ${row.full_name}`} onClick={() => { setEditing({ ...row }); setSaveError(""); setSuccess(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={buttonClass}>Edit</button>
                    <button type="button" disabled={!!editing || !!deletingId} aria-label={`Delete ${row.full_name}`} onClick={() => remove(row)} className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40">{deletingId === row.id ? "Deleting..." : "Delete"}</button>
                  </div></td>
                </tr>)}
                {!rows.length && <tr><td colSpan={8} className="p-6 text-center text-slate-500">No beneficiaries match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{total} beneficiaries · Page {page} of {pageCount}</p>
            <div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={buttonClass}>Previous</button><button type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)} className={buttonClass}>Next</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
