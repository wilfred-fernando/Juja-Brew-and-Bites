"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, GraduationCap } from "lucide-react";

// Inclusive campaign dates in Philippine time; keep expired offers off both pages.
export default function CommunityPromoBanners() {
  const [today, setToday] = useState("");

  useEffect(() => {
    const refresh = () => setToday(new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date()));
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!today) return null;
  const showQcid = today <= "2027-12-31";
  const showTeachers = today <= "2026-10-05";
  const showTeacherWeekdays = today <= "2026-10-02";
  if (!showQcid && !showTeachers) return null;

  return (
    <section aria-label="QCID and teachers promotions" className="mb-6 grid gap-4 md:grid-cols-2">
      {showQcid && (
        <article className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-emerald-950 p-6 text-white shadow-sm sm:p-7">
          <BadgeCheck aria-hidden="true" className="absolute -right-5 -top-5 h-40 w-40 rotate-12 text-emerald-800/50" strokeWidth={1} />
          <div className="relative">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">JUJA • QCID Promo</p>
            <h2 className="mt-4 text-5xl font-black tracking-tight text-white">10% <span className="text-2xl">OFF</span></h2>
            <p className="mt-3 text-lg font-semibold text-white">Your QCID comes with a treat.</p>
            <p className="mt-2 text-sm text-emerald-100">Monday to Wednesday</p>
            <p className="mt-1 text-sm text-emerald-100">Valid until December 31, 2027</p>
            <div className="mt-5 border-t border-emerald-700 pt-4 text-xs leading-5 text-emerald-100">
              Present your QCID to our cashier to avail of the promo in store.
            </div>
          </div>
        </article>
      )}
      {showTeachers && (
        <article className="relative overflow-hidden rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm sm:p-7">
          <GraduationCap aria-hidden="true" className="absolute -right-4 -top-4 h-36 w-36 -rotate-12 text-amber-200/70" strokeWidth={1} />
          <div className="relative">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-800">JUJA • Teachers Promo</p>
            <h2 className="mt-4 text-5xl font-black tracking-tight text-amber-950">{showTeacherWeekdays ? "10%" : "50%"} <span className="text-2xl">OFF</span></h2>
            <p className="mt-3 text-lg font-semibold">A little thank-you for our teachers.</p>
            {showTeacherWeekdays && (
              <>
                <p className="mt-2 text-sm">Weekdays • September 14–October 2, 2026</p>
                <p className="mt-1 text-xs leading-5">One eligible food, drink, and dessert per teacher per day.</p>
              </>
            )}
            <p className="mt-3 rounded-xl bg-amber-200/60 px-3 py-2 text-sm font-semibold">Teachers’ Day • October 5, 2026<br />50% off one regular-size drink per teacher.</p>
            <div className="mt-4 border-t border-amber-200 pt-4 text-xs leading-5">
              Present your teacher ID to our cashier to avail of the promo in store.
            </div>
          </div>
        </article>
      )}
    </section>
  );
}
