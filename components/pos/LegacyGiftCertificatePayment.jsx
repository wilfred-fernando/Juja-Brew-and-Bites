"use client";

import { useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function LegacyGiftCertificatePayment({ certificates, onChange, total, storeId, disabled, onChecking }) {
  const [serial, setSerial] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const checking = useRef(false);
  async function add() {
    if (checking.current || disabled) return;
    const code = serial.toUpperCase().replace(/[^A-Z0-9]/g, "");
    setError("");
    if (!code || code.length > 64) return setError("Enter a serial number of up to 64 letters and digits.");
    if (certificates.some(gc => gc.code === code)) return setError("This serial is already applied.");
    if (certificates.length >= 100 || (certificates.length + 1) * 100 > Number(total)) return setError("GC value cannot exceed the bill. No cash change is given for a GC.");
    checking.current = true; setBusy(true); onChecking(true);
    try {
      const { error: validationError } = await getSupabaseClient().rpc("validate_pos_legacy_gc", { p_serial: code, p_store_id: storeId });
      if (validationError) throw validationError;
      onChange([...certificates, { code, amount: 100, legacy: true }]);
      setSerial("");
    } catch (err) { setError(err.message || "Unable to check this serial. Internet is required."); }
    finally { checking.current = false; setBusy(false); onChecking(false); }
  }
  return <div className="space-y-3">
    <p className="text-sm text-slate-700">For old physical ₱100 GCs. Check the original certificate and retain it after redemption. Spaces and punctuation in serials are ignored.</p>
    <label className="block text-sm font-semibold">GC serial number
      <input value={serial} onChange={event => setSerial(event.target.value)} disabled={disabled || busy}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void add(); } }}
        autoComplete="off" maxLength={100} className="mt-1 h-11 w-full rounded-lg border px-3" />
    </label>
    <button type="button" disabled={disabled || busy} onClick={add} className="h-11 w-full rounded-lg bg-slate-800 font-semibold text-white disabled:opacity-40">{busy ? "Checking…" : "Apply ₱100 GC"}</button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {certificates.map(gc => <div key={gc.code} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
      <span className="break-all">{gc.code} · ₱100</span>
      <button type="button" disabled={disabled || busy} onClick={() => onChange(certificates.filter(item => item.code !== gc.code))} className="font-semibold underline">Remove</button>
    </div>)}
    <p className="text-sm font-semibold">GC payment: ₱{certificates.length * 100} · Remaining: ₱{Math.max(0, Number(total) - certificates.length * 100).toFixed(2)}</p>
  </div>;
}
