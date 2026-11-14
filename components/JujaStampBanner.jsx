"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { getSupabaseClient } from "@/lib/supabase/client";
import { jujaStampPhase, JUJA_STAMP_PERIOD } from "@/lib/loyalty/jujaStampCampaign.mjs";

const supabase = getSupabaseClient();

export default function JujaStampBanner({ userId, member, onViewVouchers, onLinkAccount }) {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState(() => jujaStampPhase());
  const [superAdminPreview, setSuperAdminPreview] = useState(false);
  const [previewState, setPreviewState] = useState("empty");

  const load = useCallback(async () => {
    setError("");
    if (userId) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
      const canPreview = profile?.role === "super_admin";
      setSuperAdminPreview(canPreview);
      if (canPreview) { setCard(null); setLoading(false); return; }
    }
    if (!member?.id) { setCard(null); setLoading(false); return; }
    const { data, error: loadError } = await supabase.rpc("get_juja_stamp_card", { p_member_id: member.id });
    if (loadError) setError("Stamp card is temporarily unavailable. Please try again.");
    else setCard(data);
    setLoading(false);
  }, [member?.id, userId]);

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

  const previewCounts = previewState === "complete" ? [5, 20] : previewState === "collecting" ? [3, 12] : [0, 0];
  const signature = superAdminPreview ? previewCounts[0] : Math.min(5, Number(card?.signature_stamps || 0));
  const drinks = superAdminPreview ? previewCounts[1] : Math.min(20, Number(card?.drink_stamps || 0));
  const complete = signature === 5 && drinks === 20;
  const redeemed = card?.voucher_status === "redeemed";

  return (
    <section aria-labelledby="juja-stamps-title" className="relative overflow-hidden rounded-3xl border border-rose-200 bg-gradient-to-br from-rose-50 via-white to-amber-50 p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-widest text-rose-600">JUJA DIGITAL STAMP COLLECTION</p>
          <h3 id="juja-stamps-title" className="mt-2 text-2xl font-bold text-slate-900">Collect 25 stamps get 26oz JUJA Tumbler for FREE</h3>
          <p className="mt-2 text-sm text-slate-600">Collect 5 Signature drinks stamps + 20 other drink stamps</p>
          <p className="mt-2 text-sm font-semibold text-rose-700">Promo period: {JUJA_STAMP_PERIOD} only</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">Tap JOIN NOW before purchasing. Earn one juja stamp per purchased drink after joining. Signature drinks fill signature slots only. Your free tumbler voucher is created automatically when all stamps are complete.</p>
          <p className="mt-2 text-xs font-semibold text-rose-700">Drinks that earn JUJA stamps do not earn loyalty points.</p>
          <p className="mt-1 text-xs text-slate-500">Free and redeemed items do not earn stamps. Refunded drinks have their stamps reversed.</p>
        </div>
        <figure className="m-0 flex shrink-0 flex-col items-center gap-2 self-center">
          <Image src="/promos/juja-tumbler-26oz.webp" alt="26oz JUJA tumbler with a faceted finish, matching lid and straw" width={180} height={360} sizes="(max-width: 639px) 120px, 144px" className="h-60 w-auto object-contain sm:h-72" />
          <figcaption className="text-xs font-bold uppercase tracking-widest text-rose-700">Your 26oz reward</figcaption>
        </figure>
      </div>

      {superAdminPreview && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-white/80 p-3">
          <label htmlFor="juja-admin-preview" className="text-xs font-semibold text-slate-700">Super admin preview</label>
          <select id="juja-admin-preview" value={previewState} onChange={(event) => setPreviewState(event.target.value)} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-slate-700">
            <option value="empty">Empty card</option>
            <option value="collecting">In progress</option>
            <option value="complete">Completed card</option>
          </select>
          <p className="text-xs text-slate-500">Preview only · no enrollment, stamps or voucher issued</p>
        </div>
      )}

      {(card?.joined_at || superAdminPreview) && (
        <div className="mt-5 space-y-5 rounded-2xl border border-rose-100 bg-white/75 p-4 sm:p-5">
          {[["Latte (Signature)", signature, 5], ["Other drinks", drinks, 20]].map(([label, count, target]) => (
            <div key={label}>
              <p className="mb-2 text-xs font-semibold text-slate-700">{label}: {count}/{target}</p>
              <div className="grid max-w-80 grid-cols-5 gap-3" role="img" aria-label={`${label}: ${count} of ${target} stamps`}>
                {Array.from({ length: target }, (_, index) => (
                  <span aria-hidden="true" key={index} className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-full bg-white ${index < count ? "border border-rose-200 shadow-sm" : "border-2 border-dashed border-rose-300"}`}>
                    {index < count ? <Image src="/images/juja-logo.png" alt="" width={56} height={56} className="h-full w-full rounded-full object-contain" /> : <span className="flex h-[82%] w-[82%] flex-col items-center justify-center rounded-full border border-rose-200 text-rose-300"><span className="font-serif text-lg font-bold leading-none sm:text-xl">{index + 1 + (label === "Other drinks" ? 5 : 0)}</span><span className="mt-1 text-[7px] font-bold uppercase tracking-widest">JUJA</span></span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <p className="text-sm font-semibold text-rose-700" aria-live="polite">{superAdminPreview && complete ? "Preview: all 25 stamps complete — tumbler voucher unlocks here." : redeemed ? "Tumbler voucher redeemed. Thank you for collecting JUJA stamps!" : complete ? "Your free 26oz JUJA tumbler voucher is ready in Loyalty rewards!" : `${signature + drinks}/25 stamps collected`}</p>
        </div>
      )}

      <div className="mt-5">
        {superAdminPreview ? <p className="text-xs font-medium text-slate-500">Super admins can view every card state without joining, including before the promo starts.</p>
          : loading ? <p role="status" className="text-sm text-slate-500">Loading your stamp card…</p>
          : error ? <><p role="alert" className="mb-2 text-sm text-red-700">{error}</p><button type="button" onClick={load} className="text-sm font-bold text-rose-700 underline">Try again</button></>
          : complete || redeemed ? <button type="button" onClick={onViewVouchers} className="rounded-full bg-rose-600 px-6 py-3 text-sm font-bold text-white">View tumbler voucher</button>
          : phase === "upcoming" ? <p className="text-sm font-semibold text-rose-700">JOIN and START collecting on November 20, 2026</p>
          : phase === "ended" ? <p className="text-sm font-semibold text-slate-600">This stamp promo ended on January 15, 2027.</p>
          : !member?.id ? <button type="button" onClick={onLinkAccount} className="rounded-full bg-rose-600 px-6 py-3 text-sm font-bold text-white">Link loyalty account to join</button>
          : !card?.joined_at ? <button type="button" onClick={join} disabled={joining} className="rounded-full bg-rose-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{joining ? "Joining…" : "JOIN NOW"}</button>
          : <p className="text-xs text-slate-500">You’re enrolled. Your qualifying purchases now earn stamps.</p>}
      </div>
    </section>
  );
}
