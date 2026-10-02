"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

import { getSupabaseClient } from "@/lib/supabase/client";

export default function CommunityPromoBanners({ detailed = false, layout = "grid" }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { data, error } = await getSupabaseClient().from("public_promo_cards").select("id,content,starts_on,ends_on").eq("is_active", true).order("sort_order").order("id");
        if (!alive) return;
        setLoadError(Boolean(error));
        if (!error) setCampaigns((data || []).map(row => ({ ...row.content, id: row.id, start: row.starts_on, end: row.ends_on })));
      } catch {
        if (alive) setLoadError(true);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  const [today, setToday] = useState("");
  useEffect(() => {
    const refresh = () => setToday(new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date()));
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!today || loading) return detailed ? <p className="p-6 text-stone-600">Loading promos…</p> : null;
  if (loadError) return detailed ? <p role="alert" className="p-6 text-stone-600">Promos could not be loaded. Please refresh to try again.</p> : null;
  const visible = campaigns.filter((campaign) => (!campaign.start || today >= campaign.start) && (!campaign.end || today <= campaign.end));
  if (!visible.length) return detailed ? <p className="rounded-3xl border border-stone-200 bg-white p-8 text-center text-stone-600">Our next treats are brewing. Check back soon for new offers.</p> : null;

  return (
    <section aria-label="JUJA promotions" className={`grid gap-6 ${layout === "list" ? "grid-cols-1" : visible.length > 1 ? "md:grid-cols-2" : "max-w-2xl mx-auto"} ${detailed ? "" : "mb-6"}`}>
      {visible.map((campaign) => (
        <article key={campaign.id} className={`overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-[0_12px_40px_rgba(44,38,30,0.06)] ${layout === "list" ? "grid items-center md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]" : ""}`}>
          <a href={campaign.image} target="_blank" rel="noopener noreferrer" className={`block focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 ${layout === "list" ? "mx-auto w-full max-w-[300px] p-4" : ""}`} aria-label={`View full-size ${campaign.label} artwork (opens in new tab)`}>
            <Image unoptimized src={campaign.image} width={campaign.width} height={campaign.height} sizes={layout === "list" ? "268px" : "(max-width: 767px) 100vw, 50vw"} alt={`${campaign.label}: ${campaign.offer}. ${campaign.schedule}. ${campaign.details}`} className="h-auto w-full" />
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
