"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const campaigns = [
  {
    id: "egc-holiday", title: "JUJA e-Gift Certificates", label: "e-GC 10+1 Promo",
    image: "/promos/egc-10-plus-1-v3.png", width: 1386, height: 1135,
    schedule: "Buy 10, get 1 FREE · ₱1,000",
    offer: "JUJA e-Gift Certificates — 10+1",
    details: "Get eleven ₱100 e-Gift Certificates for ₱1,000. Prefer a physical gift certificate? Send us a request.",
    tone: "bg-emerald-50 text-emerald-900",
    requiresId: false,
  },
  {
    id: "qcid", title: "Your city. Your perks.", label: "QCID Promo",
    image: "/promos/qcid-2026.jpg", width: 960, height: 788,
    end: "2026-12-31", schedule: "Monday–Wednesday · Until December 31, 2026",
    offer: "10% off food & drinks",
    details: "Present a valid QCID before payment. One redemption per day. Cannot be combined with other promos or discounts.",
    tone: "bg-violet-50 text-violet-900",
  },
  {
    id: "teachers", title: "For the ones who inspire.", label: "Teachers’ Month Promo",
    image: "/promos/teachers-month-2026.png", width: 1385, height: 1136,
    end: "2026-10-05", schedule: "September 14–October 5, 2026",
    offer: "A well-deserved teacher treat",
    details: "10% off Monday–Friday, September 14–October 2. On October 5, enjoy 50% off one regular-size drink. Present a valid school ID. Daily limits apply: one eligible food, drink, and dessert for the 10% offer.",
    tone: "bg-rose-50 text-rose-900",
  },
];

export default function CommunityPromoBanners({ detailed = false, layout = "grid" }) {
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
  const visible = campaigns.filter((campaign) => !campaign.end || today <= campaign.end);
  if (!visible.length) return detailed ? <p className="rounded-3xl border border-stone-200 bg-white p-8 text-center text-stone-600">Our next treats are brewing. Check back soon for new offers.</p> : null;

  return (
    <section aria-label="JUJA promotions" className={`grid gap-6 ${layout === "list" ? "grid-cols-1" : visible.length > 1 ? "md:grid-cols-2" : "max-w-2xl mx-auto"} ${detailed ? "" : "mb-6"}`}>
      {visible.map((campaign) => (
        <article key={campaign.id} className={`overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-[0_12px_40px_rgba(44,38,30,0.06)] ${layout === "list" ? "grid items-center md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" : ""}`}>
          <a href={campaign.image} target="_blank" rel="noopener noreferrer" className="block focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-emerald-700" aria-label={`View full-size ${campaign.label} artwork (opens in new tab)`}>
            <Image src={campaign.image} width={campaign.width} height={campaign.height} sizes="(max-width: 767px) 100vw, 50vw" alt={`${campaign.label}: ${campaign.offer}. ${campaign.schedule}. ${campaign.details}`} className="h-auto w-full" />
          </a>
          <div className={detailed ? "p-6 sm:p-8" : "p-4"}>
            <p className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${campaign.tone}`}>{campaign.label}</p>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">{campaign.title}</h2>
            <p className="mt-2 text-sm font-medium text-stone-700">{campaign.schedule}</p>
            {detailed && <p className="mt-3 text-sm leading-7 text-stone-600">{campaign.details}</p>}
            {campaign.requiresId !== false && (
              <p className="mt-4 text-xs text-stone-500">Available in store · Present your valid ID before payment</p>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
