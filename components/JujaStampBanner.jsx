"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { jujaStampPhase, JUJA_STAMP_PERIOD } from "@/lib/loyalty/jujaStampCampaign.mjs";

const supabase = getSupabaseClient();

export default function JujaStampBanner({ member, onViewVouchers, onLinkAccount }) {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState(() => jujaStampPhase());

  const load = useCallback(async () => {
    setError("");
    if (!member?.id) { setCard(null); setLoading(false); return; }
    const { data, error: loadError } = await supabase.rpc("get_juja_stamp_card", { p_member_id: member.id });
    if (loadError) setError("Stamp card is temporarily unavailable. Please try again.");
    else setCard(data);
    setLoading(false);
  }, [member?.id]);

  useEffect(() => {
    setCard(null);
    setLoading(true);
    void load();
    const refresh = () => { if (!document.hidden) { setPhase(jujaStampPhase()); void load(); } };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }, [load]);

  async function join() {
    setJoining(true);
    setError("");
    const { data, error: joinError } = await supabase.rpc("join_juja_stamp_card", { p_member_id: member.id });
    if (joinError) setError("Unable to join right now. Please try again.");
    else setCard(data);
    setJoining(false);
  }

  const signature = Math.min(5, Number(card?.signature_stamps || 0));
  const drinks = Math.min(20, Number(card?.drink_stamps || 0));
  const complete = signature === 5 && drinks === 20;
  const redeemed = card?.voucher_status === "redeemed";

  return (
    <section aria-labelledby="juja-stamps-title" className="relative overflow-hidden rounded-3xl border border-rose-200 bg-gradient-to-br from-rose-50 via-white to-amber-50 p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <p className="text-xs font-bold uppercase tracking-widest text-rose-600">JUJA DIGITAL STAMP COLLECTION</p>
          <h3 id="juja-stamps-title" className="mt-2 text-2xl font-bold text-slate-900">Collect 25 stamps get 26oz JUJA Tumbler for FREE</h3>
          <p className="mt-2 text-sm text-slate-600">Collect 5 Signature drinks stamps + 20 other drink stamps</p>
          <p className="mt-2 text-sm font-semibold text-rose-700">Promo period: {JUJA_STAMP_PERIOD} only</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">Tap JOIN NOW before purchasing. Earn one juja stamp per purchased drink after joining. Signature drinks fill signature slots only. Your free tumbler voucher is created automatically when all stamps are complete.</p>
        </div>
        <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-4xl">🥤</span>
      </div>

      {card?.joined_at && (
        <div className="mt-5 space-y-4">
          {[["Latte (Signature)", signature, 5], ["Other drinks", drinks, 20]].map(([label, count, target]) => (
            <div key={label}>
              <p className="mb-2 text-xs font-semibold text-slate-700">{label}: {count}/{target}</p>
              <div className="flex flex-wrap gap-2" role="img" aria-label={`${label}: ${count} of ${target} stamps`}>
                {Array.from({ length: target }, (_, index) => (
                  <span aria-hidden="true" key={index} className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${index < count ? "border-rose-500 bg-rose-500 text-white" : "border-dashed border-rose-300 bg-white text-rose-300"}`}>{index < count ? "✓" : index + 1}</span>
                ))}
              </div>
            </div>
          ))}
          <p className="text-sm font-semibold text-rose-700" aria-live="polite">{redeemed ? "Tumbler voucher redeemed. Thank you for collecting JUJA stamps!" : complete ? "Your free 26oz JUJA tumbler voucher is ready in Loyalty rewards!" : `${signature + drinks}/25 stamps collected`}</p>
        </div>
      )}

      <div className="mt-5">
        {loading ? <p role="status" className="text-sm text-slate-500">Loading your stamp card…</p>
          : error ? <><p role="alert" className="mb-2 text-sm text-red-700">{error}</p><button type="button" onClick={load} className="text-sm font-bold text-rose-700 underline">Try again</button></>
          : complete || redeemed ? <button type="button" onClick={onViewVouchers} className="rounded-full bg-rose-600 px-6 py-3 text-sm font-bold text-white">View tumbler voucher</button>
          : phase === "upcoming" ? <p className="text-sm font-semibold text-rose-700">JOIN and START collecting on November 15, 2026</p>
          : phase === "ended" ? <p className="text-sm font-semibold text-slate-600">This stamp promo ended on January 15, 2027.</p>
          : !member?.id ? <button type="button" onClick={onLinkAccount} className="rounded-full bg-rose-600 px-6 py-3 text-sm font-bold text-white">Link loyalty account to join</button>
          : !card?.joined_at ? <button type="button" onClick={join} disabled={joining} className="rounded-full bg-rose-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{joining ? "Joining…" : "JOIN NOW"}</button>
          : <p className="text-xs text-slate-500">You’re enrolled. Your qualifying purchases now earn stamps.</p>}
      </div>
    </section>
  );
}
