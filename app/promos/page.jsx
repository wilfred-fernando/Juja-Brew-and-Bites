"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

// --- Constants ---
const supabase = getSupabaseClient();

const LOGO =
  "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

export default function PromoPage() {
  const [promos, setPromos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchPromos() {
      try {
        const { data } = await supabase
          .from("promotions")
          .select("*")
          .eq("is_active", true);

        setPromos(data || []);
      } catch (error) {
        console.error("Error fetching promos:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchPromos();
  }, []);

  return (
    <div className="juja-page-bg min-h-screen bg-slate-50/50 text-slate-800 font-sans flex flex-col justify-between">
      <div>
        {/* Shared Nav Component (Active ID: 'promo') */}
        <Nav active="promo" />

        {/* Main Content Area */}
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-12 pt-28 pb-16">
          
          {/* Header Typography Section */}
          <div className="text-center max-w-2xl mx-auto mb-16 mt-6">
            <span className="text-[10px] uppercase tracking-[0.25em] text-[#FC687D] bg-[#FC687D]/10 px-4 py-1.5 rounded-full font-semibold">
              Exclusive Perks
            </span>
            <h1 className="text-3xl sm:text-4xl font-normal tracking-tight text-slate-800 mt-4 mb-4">
              Deals &amp; Promotions
            </h1>
            <p className="text-slate-500 text-sm sm:text-base font-normal leading-relaxed">
              Explore our latest limited-time treats. Click on any active offer to apply the savings directly to your checkout.
            </p>
          </div>

          {/* Skeleton Loading State */}
          {isLoading && (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <div 
                  key={n} 
                  className="h-48 bg-slate-100 rounded-2xl border border-slate-200/60 animate-pulse" 
                />
              ))}
            </div>
          )}

          {/* Empty State Block */}
          {!isLoading && promos.length === 0 && (
            <div className="text-center py-16 border border-dashed border-slate-200 rounded-2xl bg-white max-w-md mx-auto shadow-sm">
              <span className="text-3xl">✨</span>
              <h3 className="mt-4 text-sm font-medium text-slate-700 tracking-wide">No Active Promotions</h3>
              <p className="mt-1.5 text-xs text-slate-400 max-w-xs mx-auto">
                We are mixing up brand new recipes and offers. Follow us or check back soon!
              </p>
            </div>
          )}

          {/* Promos Cards Grid Layout */}
          {!isLoading && promos.length > 0 && (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              { promos.map((p) => (
                <div
                  key={p.id}
                  className="group relative flex flex-col justify-between border border-slate-100 rounded-2xl p-6 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_10px_30px_rgba(0,0,0,0.06)] transition-all duration-300 hover:-translate-y-1"
                >
                  <div>
                    {/* Voucher Code Tag */}
                    <div className="mb-4">
                      <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md uppercase tracking-wider border border-slate-200/70">
                        {p.code}
                      </span>
                    </div>

                    <h3 className="font-semibold text-base text-slate-800 leading-snug group-hover:text-[#FC687D] transition-colors duration-200">
                      {p.title}
                    </h3>
                    
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed line-clamp-3">
                      {p.description}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-50 flex items-center justify-between">
                    <Link
                      href={`/customer?tab=order&promo=${p.code}`}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#FC687D] group-hover:text-rose-400 transition-colors duration-200"
                    >
                      <span>Claim Code</span>
                      <span className="transform group-hover:translate-x-1 transition-transform duration-200">→</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Shared Footer Component */}
      <Footer />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
    Shared Nav (Pure JavaScript Syntax)
───────────────────────────────────────────────────────────── */
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
    ["about", "About Us", "/about"]
  ];

  const mobileLinks = [
    ["Home", "/"],
    ["Menu", "/menu"],
    ["Promos", "/promos"],
    ["Function Room", "/function-room"],
    ["About Us", "/about"]
  ];

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ${
      scrolled ? "bg-white/95 backdrop-blur-2xl shadow-[0_1px_30px_rgba(0,0,0,0.05)]" : "bg-transparent"
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 flex items-center justify-between h-20">
        <Link href="/" className="flex-shrink-0">
          <img src={LOGO} alt="Juja" className="h-12 sm:h-14 md:h-16 w-auto object-contain transition-all duration-300 hover:scale-105 drop-shadow-sm" />
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-8">
          {links.map(([id, label, href]) => (
            <Link key={id} href={href}
              className={`relative text-[11px] lg:text-[12px] font-semibold uppercase tracking-[0.18em] transition-all duration-300 group pb-1 ${
                active === id ? "text-[#FC687D]" : "text-slate-600 hover:text-slate-900"
              }`}>
              {label}
              <span className={`absolute bottom-0 left-0 h-[2px] rounded-full bg-gradient-to-r from-[#FC687D] to-rose-400 transition-all duration-350 ${
                active === id ? "w-full" : "w-0 group-hover:w-full"
              }`} />
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link
            href={loginUrl}
            className="text-[11px] font-semibold uppercase tracking-widest px-5 py-2.5 rounded-full border border-slate-200 text-slate-500 hover:border-[#FC687D] hover:text-[#FC687D] transition-colors"
          >
            Login
          </Link>
        </div>

        <button
          className="md:hidden p-2 text-slate-800"
          onClick={() => setOpen(!open)}
          aria-label="Toggle Menu"
          type="button"
        >
          <div className="w-5 space-y-[5px]">
            <span className={`block h-[2px] bg-current rounded-full transition-all duration-300 ${open ? "rotate-45 translate-y-[7px]" : ""}`} />
            <span className={`block h-[2px] bg-current rounded-full transition-all duration-300 ${open ? "opacity-0" : ""}`} />
            <span className={`block h-[2px] bg-current rounded-full transition-all duration-300 ${open ? "-rotate-45 -translate-y-[7px]" : ""}`} />
          </div>
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-white border-t border-slate-100 px-6 py-6 flex flex-col gap-3">
          {mobileLinks.map(([label, href]) => (
            <Link
              key={label}
              href={href}
              onClick={() => setOpen(false)}
              className="text-slate-800 font-medium tracking-wide text-sm py-2 border-b border-slate-50"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/order"
            onClick={() => setOpen(false)}
            className="mt-4 py-3.5 rounded-full bg-[#FC687D] text-white font-semibold text-sm text-center"
          >
            Order Now →
          </Link>
          <Link
            href={loginUrl}
            onClick={() => setOpen(false)}
            className="py-3.5 rounded-full border border-[#087830]/50 bg-white/80 text-[#087830] font-semibold text-sm text-center"
          >
            Login
          </Link>
        </div>
      )}
    </nav>
  );
}

/* ─────────────────────────────────────────────────────────────
    Shared Footer
───────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-2 md:py-3 px-6 flex-none">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-5 mb-2 md:mb-3">
        <div className="flex flex-col justify-center">
          <p className="text-slate-400 mb-2 leading-relaxed max-w-sm">
            ROMANS 15:13
          </p>
          <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
            May the God of hope fill you with all joy and peace...
          </p>
        </div>

        <div className="text-xs">
          <p className="text-[#FC687D] font-bold mb-2 uppercase text-[10px] tracking-[0.2em]">
            Pasong Tamo Branch
          </p>
          <div className="space-y- text-slate-400 leading-relaxed">
            <p>📍 36D Visayas Ave., Pasong Tamo, QC</p>
            <p>📞 0939-9228383</p>
            <p className="text-slate-500 text-[11px]">Store: 10AM–12MN · Function Room: 10AM–2AM</p>
          </div>
        </div>

        <div className="text-xs">
          <p className="text-[#FC687D] font-bold mb-2 uppercase text-[10px] tracking-[0.2em]">
            Diliman Branch
          </p>
          <div className="space-y-1 text-slate-400 leading-relaxed">
            <p>📍 8 Visayas Ave., Diliman, QC</p>
            <p>📞 0961-6320909</p>
            <p className="text-slate-500 text-[11px]">Mon-Wed: 8AM–10PM · Thu-Sat: 10AM–10PM</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto pt-2 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center text-slate-500 text-[10px] tracking-wider uppercase">
        <p>© {new Date().getFullYear()} Juja Brew &amp; Bites® · All rights reserved</p>
        <p>Quezon City · Philippines</p>
      </div>
    </footer>
  );
}
