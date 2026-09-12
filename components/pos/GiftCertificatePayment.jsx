"use client";

import { useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function GiftCertificatePayment({ certificates, onChange, total, storeId, disabled, onChecking }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);

  async function add() {
    if (disabled || checkingRef.current) return;
    const normalized = code.trim().toUpperCase();
    setError("");
    if (!normalized) return setError("Enter or scan a certificate code.");
    if (certificates.some((gc) => gc.code === normalized)) return setError("This code is already applied.");
    if ((certificates.length + 1) * 100 > Number(total)) return setError("A ₱100 certificate cannot exceed the remaining bill. Certificates do not give cash change.");
    checkingRef.current = true;
    setChecking(true);
    onChecking(true);
    try {
      const { data, error: validationError } = await getSupabaseClient().rpc("validate_pos_booking_gc", { p_code: normalized, p_store_id: storeId });
      if (validationError) throw validationError;
      onChange([...certificates, data]);
      setCode("");
    } catch (err) { setError(err.message || "Unable to validate the certificate. Check your connection."); }
    finally { checkingRef.current = false; setChecking(false); onChecking(false); }
  }

  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-3">
      <h3 className="text-sm font-bold text-green-900">Redeem e-GC</h3>
      <p className="mt-1 text-xs text-green-800">₱100 per approved code. Online only. Codes are used when the sale is saved.</p>
      <div className="mt-2 flex gap-2">
        <input aria-label="e-GC code" value={code} disabled={disabled || checking} autoComplete="off"
          onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }}
          placeholder="Enter or scan JUJA-GC code" className="min-w-0 flex-1 rounded-lg border bg-white p-2 text-xs" />
        <button type="button" onClick={add} disabled={disabled || checking} className="rounded-lg bg-green-800 px-3 text-xs font-bold text-white disabled:opacity-40">{checking ? "Checking…" : "Apply"}</button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      {certificates.map((gc) => <div key={gc.code} className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="break-all">{gc.code} · ₱100</span>
        <button type="button" disabled={disabled || checking} onClick={() => onChange(certificates.filter((item) => item.code !== gc.code))} className="font-bold underline">Remove</button>
      </div>)}
      {certificates.length > 0 && <p className="mt-2 text-sm font-bold">e-GC payment: ₱{certificates.length * 100} · Remaining: ₱{Math.max(0, Number(total) - certificates.length * 100).toFixed(2)}</p>}
    </div>
  );
}
