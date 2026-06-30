"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

const LOGO = "https://images.jujabrewandbites.com/SIGNAGE%20light%20with%20korean%20letters%203.png";

function formatMoney(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

function getPromoValue(promo) {
  const discount = Number(promo.discount_value ?? promo.discount ?? 0);
  if (discount <= 0) return promo.title || "Featured Promo";
  if ((promo.discount_type || promo.type) === "percent") return `${discount}% OFF`;
  return `${formatMoney(discount)} OFF`;
}

function getPromoDescription(promo) {
  if (promo.description) return promo.description;
  const minimum = Number(promo.min_order || 0);
  if (minimum > 0) {
    return `Use this code on orders worth at least ${formatMoney(minimum)}.`;
  }
  return "Use this code on your next Juja order while the offer is active.";
}

export default function PromoPage() {
  const [promos, setPromos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function fetchPromos() {
      setIsLoading(true);
      setError("");

      const { data, error: promoError } = await supabase
        .from("promotions")
        .select("id, code, title, description, discount_type, discount_value, is_active, start_date, end_date, created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (!mounted) return;

      if (promoError) {
        console.error("Error fetching promos:", promoError);
        setPromos([]);
        setError("Promos are temporarily unavailable. Please check again soon.");
      } else {
        setPromos(data || []);
      }

      setIsLoading(false);
    }

    fetchPromos();

    return () => {
      mounted = false;
    };
  }, []);

  const featuredPromo = useMemo(() => promos[0] || null, [promos]);
  const otherPromos = useMemo(() => promos.slice(1), [promos]);

  return (
    <div className="juja-page-bg flex min-h-screen flex-col bg-white text-slate-900">
      <Nav active="promo" />

      <main className="flex-1 px-4 pb-14 pt-24 sm:px-6 lg:px-10">
        <section className="mx-auto max-w-7xl">
          <div className="grid items-stretch gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[2rem] border border-white/70 bg-white/78 p-7 shadow-[0_28px_80px_rgba(51,65,85,0.16)] backdrop-blur-xl sm:p-9 lg:p-10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#087830]">
                Current Promos
              </p>
              <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-5xl">
                Fresh deals for your next Juja craving.
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-7 text-slate-700 sm:text-base">
                Browse active promo codes created from Admin Promos. Claim a code, order from the customer portal, and enjoy the latest offers while they are available.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/customer?tab=order"
                  className="inline-flex items-center justify-center rounded-full bg-[#087830] px-7 py-3 text-sm font-semibold text-white shadow-[0_18px_38px_rgba(8,120,48,0.25)] transition hover:-translate-y-0.5 hover:bg-[#096b2d]"
                >
                  Order Now
                </Link>
                <Link
                  href="/menu"
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white/78 px-7 py-3 text-sm font-semibold text-slate-800 transition hover:-translate-y-0.5 hover:border-[#087830] hover:text-[#087830]"
                >
                  View Menu
                </Link>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-slate-800 p-7 text-white shadow-[0_28px_80px_rgba(15,23,42,0.22)] sm:p-9">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(125,211,252,0.28),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(8,120,48,0.28),transparent_28%)]" />
              <div className="relative">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100">
                  Featured Code
                </p>

                {isLoading ? (
                  <div className="mt-8 space-y-5">
                    <div className="h-14 w-56 animate-pulse rounded-2xl bg-white/15" />
                    <div className="h-4 w-72 animate-pulse rounded-full bg-white/15" />
                    <div className="h-24 animate-pulse rounded-3xl bg-white/10" />
                  </div>
                ) : featuredPromo ? (
                  <div className="mt-7">
                    <div className="inline-flex rounded-2xl border border-white/25 bg-white/12 px-5 py-3 font-mono text-2xl font-semibold uppercase tracking-[0.16em] text-white">
                      {featuredPromo.code}
                    </div>
                    <h2 className="mt-7 text-5xl font-semibold tracking-tight text-white sm:text-6xl">
                      {getPromoValue(featuredPromo)}
                    </h2>
                    <p className="mt-4 max-w-lg text-sm leading-7 text-slate-100">
                      {getPromoDescription(featuredPromo)}
                    </p>
                    <div className="mt-7 rounded-3xl border border-white/15 bg-white/10 p-5">
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <span className="text-slate-200">Minimum order</span>
                        <span className="font-semibold text-white">
                          {Number(featuredPromo.min_order || 0) > 0 ? formatMoney(featuredPromo.min_order) : "No minimum"}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-9 rounded-3xl border border-white/15 bg-white/10 p-7">
                    <h2 className="text-2xl font-semibold text-white">No active promo today</h2>
                    <p className="mt-3 text-sm leading-7 text-slate-200">
                      New promo codes will appear here automatically once enabled in Admin Promos.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[2rem] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(51,65,85,0.12)] backdrop-blur-xl sm:p-7">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Promo Board
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">All Active Offers</h2>
              </div>
              <p className="text-sm text-slate-600">{promos.length} active promo{promos.length === 1 ? "" : "s"}</p>
            </div>

            {error && (
              <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((item) => (
                  <div key={item} className="h-48 animate-pulse rounded-3xl border border-slate-200 bg-slate-100/80" />
                ))}
              </div>
            ) : promos.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 px-6 py-14 text-center">
                <p className="text-lg font-semibold text-slate-900">No active promotions</p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                  Promo codes enabled in Admin Promos will show here automatically.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {(otherPromos.length ? otherPromos : promos).map((promo) => (
                  <PromoCard key={promo.id || promo.code} promo={promo} />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function PromoCard({ promo }) {
  return (
    <article className="group flex min-h-[210px] flex-col justify-between rounded-3xl border border-slate-200/80 bg-white/86 p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-[#087830]/45 hover:shadow-[0_20px_45px_rgba(51,65,85,0.14)]">
      <div>
        <div className="flex items-start justify-between gap-4">
          <span className="rounded-2xl bg-slate-900 px-4 py-2 font-mono text-sm font-semibold uppercase tracking-[0.16em] text-white">
            {promo.code}
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Active
          </span>
        </div>
        <h3 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950">
          {getPromoValue(promo)}
        </h3>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {getPromoDescription(promo)}
        </p>
      </div>
      <Link
        href={`/customer?tab=order&promo=${encodeURIComponent(promo.code || "")}`}
        className="mt-6 inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-800 transition group-hover:border-[#087830] group-hover:bg-[#087830] group-hover:text-white"
      >
        Claim Code
      </Link>
    </article>
  );
}

function Nav({ active }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [loginUrl, setLoginUrl] = useState("https://customer.jujabrewandbites.com/login");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      setLoginUrl(isLocal ? "http://customer.localhost:3000/login" : "https://customer.jujabrewandbites.com/login");
    }

    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const links = [
    ["home", "Home", "/"],
    ["menu", "Menu", "/menu"],
    ["promo", "Promos", "/promos"],
    ["function room", "Function Room", "/function-room"],
    ["event-cart", "Event Cart", "/event-cart"],
    ["about", "About Us", "/about"],
  ];

  return (
    <nav className={`fixed top-0 z-50 w-full transition-all duration-500 ${
      scrolled ? "bg-white/95 shadow-[0_1px_30px_rgba(0,0,0,0.05)] backdrop-blur-2xl" : "bg-transparent"
    }`}>
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-12">
        <Link href="/" className="flex-shrink-0">
          <img src={LOGO} alt="Juja" className="h-12 w-auto object-contain drop-shadow-sm transition-all duration-300 hover:scale-105 sm:h-14 md:h-16" />
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {links.map(([id, label, href]) => (
            <Link
              key={id}
              href={href}
              className={`group relative pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-all duration-300 lg:text-[12px] ${
                active === id ? "text-[#087830]" : "text-slate-700 hover:text-slate-950"
              }`}
            >
              {label}
              <span className={`absolute bottom-0 left-0 h-[2px] rounded-full bg-[#087830] transition-all duration-300 ${
                active === id ? "w-full" : "w-0 group-hover:w-full"
              }`} />
            </Link>
          ))}
        </div>

        <Link
          href={loginUrl}
          className="hidden rounded-full border border-[#087830]/45 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-[#087830] transition hover:bg-[#087830] hover:text-white md:inline-flex"
        >
          Login
        </Link>

        <button
          className="p-2 text-slate-900 md:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-label="Toggle menu"
          type="button"
        >
          <div className="w-5 space-y-[5px]">
            <span className={`block h-[2px] rounded-full bg-current transition-all duration-300 ${open ? "translate-y-[7px] rotate-45" : ""}`} />
            <span className={`block h-[2px] rounded-full bg-current transition-all duration-300 ${open ? "opacity-0" : ""}`} />
            <span className={`block h-[2px] rounded-full bg-current transition-all duration-300 ${open ? "-translate-y-[7px] -rotate-45" : ""}`} />
          </div>
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-6 py-6 md:hidden">
          {links.map(([, label, href]) => (
            <Link
              key={label}
              href={href}
              onClick={() => setOpen(false)}
              className="border-b border-slate-100 py-2 text-sm font-medium tracking-wide text-slate-800"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/customer?tab=order"
            onClick={() => setOpen(false)}
            className="mt-4 rounded-full bg-[#087830] py-3.5 text-center text-sm font-semibold text-white"
          >
            Order Now
          </Link>
          <Link
            href={loginUrl}
            onClick={() => setOpen(false)}
            className="rounded-full border border-[#087830]/50 bg-white/80 py-3.5 text-center text-sm font-semibold text-[#087830]"
          >
            Login
          </Link>
        </div>
      )}
    </nav>
  );
}

function Footer() {
  return (
    <footer className="flex-none bg-slate-900 px-6 py-2 text-slate-400 md:py-3">
      <div className="mx-auto mb-2 grid max-w-7xl grid-cols-1 gap-3 md:mb-3 md:grid-cols-3 md:gap-5">
        <div className="flex flex-col justify-center">
          <p className="mb-2 max-w-sm leading-relaxed text-slate-300">ROMANS 15:13</p>
          <p className="max-w-sm text-xs leading-relaxed text-slate-400">
            May the God of hope fill you with all joy and peace...
          </p>
        </div>

        <div className="text-xs">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
            Pasong Tamo Branch
          </p>
          <div className="space-y-1 leading-relaxed text-slate-300">
            <p>36D Visayas Ave., Pasong Tamo, QC</p>
            <p>0939-9228383</p>
            <p className="text-[11px] text-slate-400">Store: 10AM-12MN - Function Room: 10AM-2AM</p>
          </div>
        </div>

        <div className="text-xs">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
            Diliman Branch
          </p>
          <div className="space-y-1 leading-relaxed text-slate-300">
            <p>8 Visayas Ave., Diliman, QC</p>
            <p>0961-6320909</p>
            <p className="text-[11px] text-slate-400">Mon-Wed: 8AM-10PM - Thu-Sat: 10AM-10PM</p>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between border-t border-white/10 pt-2 text-[10px] uppercase tracking-wider text-slate-400 sm:flex-row">
        <p>(c) {new Date().getFullYear()} Juja Brew &amp; Bites - All rights reserved</p>
        <p>Quezon City - Philippines</p>
      </div>
    </footer>
  );
}
