"use client";
export default function AvailabilityToggle({ available, busy, disabled, name, scope, onChange }) {
  return <button type="button" role="switch" aria-checked={available} aria-label={`${name}: ${available ? "available" : "unavailable"}. ${scope}`} disabled={busy || disabled} onClick={onChange}
    className="inline-flex min-h-11 shrink-0 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left disabled:cursor-wait disabled:opacity-50">
    <span aria-hidden="true" style={{ display:"inline-flex", alignItems:"center", width:36, height:22, padding:3, borderRadius:20, background:available ? "#16816a" : "#64748b", justifyContent:available ? "flex-end" : "flex-start" }}><span style={{ width:16,height:16,borderRadius:"50%",background:"white" }} /></span>
    <span><span className="block text-xs font-semibold text-slate-800">{busy ? "Saving…" : available ? "Available" : "Unavailable"}</span><span className="block text-[10px] font-normal text-slate-500">{scope}</span></span>
  </button>;
}
