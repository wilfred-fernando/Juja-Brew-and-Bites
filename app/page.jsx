"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// Mock or import your supabase client instance here
const supabase = (typeof globalThis !== "undefined" && globalThis.supabase) || {
  from: () => ({
    select: () => ({
      eq: () => ({ limit: () => Promise.resolve({ data: [] }) }),
    }),
  }),
};

const LOGO = "https://images.jujabrewandbites.com/SIGNAGE%20light%20with%20korean%20letters%203.png";
const HERO_MASCOT = "https://images.jujabrewandbites.com/juja%201.png";
const HERO_LOGO = "https://images.jujabrewandbites.com/juja%202.png";

// ─── Shared Nav ───────────────────────────────────────────────────────────────
function Nav({ active }) {
  const [open, setOpen] = useState(false);
  const [loginUrl, setLoginUrl] = useState("https://customer.jujabrewandbites.com/login");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      setLoginUrl(isLocal ? "http://customer.localhost:3000/login" : "https://customer.jujabrewandbites.com/login");
    }
  }, []);

  const links = [
    ["home", "Home", "/"],
    ["menu", "Menu", "/menu"],
    ["promo", "Promos", "/promos"],
    ["function room", "Function Room", "/function-room"],
    ["about", "About Us", "/about"]
  ];

  return (
    <nav className="relative w-full z-50 bg-white/95 backdrop-blur-2xl shadow-[0_1px_30px_rgba(0,0,0,0.05)] flex-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 flex items-center justify-between h-14 md:h-16">
        <Link href="/" className="flex-shrink-0">
          <img src={LOGO} alt="Juja" className="h-8 sm:h-10 md:h-11 w-auto object-contain transition-all duration-300 hover:scale-105" />
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

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link 
            href={loginUrl}
            className="text-[11px] font-semibold uppercase tracking-widest px-5 py-1.5 rounded-full border border-slate-200 text-slate-500 hover:border-[#FC687D] hover:text-[#FC687D] transition-all duration-300"
          >
            Login
          </Link>          
        </div>

        {/* Mobile Toggle */}
        <button className="md:hidden p-2 text-slate-800" onClick={() => setOpen(!open)} aria-label="Toggle Menu">
          <div className="w-5 space-y-[4px]">
            <span className={`block h-[2px] bg-current rounded-full transition-all duration-300 ${open ? "rotate-45 translate-y-[6px]" : ""}`} />
            <span className={`block h-[2px] bg-current rounded-full transition-all duration-300 ${open ? "opacity-0" : ""}`} />
            <span className={`block h-[2px] bg-current rounded-full transition-all duration-300 ${open ? "-rotate-45 -translate-y-[6px]" : ""}`} />
          </div>
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {open && (
        <div className="absolute top-14 left-0 w-full z-50 md:hidden bg-white/98 backdrop-blur-xl border-t border-slate-100 shadow-2xl px-6 py-4 flex flex-col gap-2">
          {links.map(([, l, h]) => (
            <Link key={l} href={h} onClick={() => setOpen(false)}
              className="text-slate-800 font-medium uppercase tracking-widest text-xs hover:text-[#FC687D] transition py-1.5 border-b border-slate-50">{l}</Link>
          ))}
          <Link href={loginUrl} onClick={() => setOpen(false)}
              className="text-slate-800 font-medium uppercase tracking-widest text-xs hover:text-[#FC687D] transition py-1.5 border-b border-slate-50">Login</Link>          
        </div>
      )}
    </nav>
  );
}

// ─── Shared Footer ────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-6 md:py-8 px-6 flex-none">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10 mb-4 md:mb-6">
        {/* Brand Block */}
        <div className="flex flex-col justify-center">
          <img
            src={LOGO}
            alt="Juja"
            className="h-10 w-auto object-contain mb-3 brightness-0 invert opacity-60 self-start"
          />
          <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
            Your premier destination for specialty brews and artisan bites in Quezon City.
          </p>
        </div>

        {/* Branch 1: Pasong Tamo */}
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

        {/* Branch 2: Diliman */}
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

      {/* Footer Bottom Metadata Bar */}
      <div className="max-w-7xl mx-auto pt-4 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center text-slate-500 text-[10px] tracking-wider uppercase">
        <p>© {new Date().getFullYear()} Juja Brew &amp; Bites® · All rights reserved</p>
        <p>Quezon City · Philippines</p>
      </div>
    </footer>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    // Configured mobile-first scroll wrapper swap (min-h-screen md:h-screen overflow-y-auto md:overflow-hidden)
    <div className="juja-page-bg min-h-screen md:h-screen w-screen overflow-y-auto md:overflow-hidden flex flex-col bg-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Nav active="home" />

      {/* HERO */}
      <section className="relative flex-none md:flex-1 flex items-center justify-center overflow-hidden px-5 py-8 sm:px-8 md:px-10 md:py-6">
        <div className="relative z-10 mx-auto grid h-full w-full max-w-6xl items-center gap-6 md:grid-cols-[0.9fr_1.1fr] md:gap-10">
          <div className="order-2 flex justify-center md:order-1 md:justify-end">
            <img
              src={HERO_MASCOT}
              alt="Juja mascot"
              className="h-[280px] w-auto object-contain drop-shadow-[0_20px_35px_rgba(15,23,42,0.14)] sm:h-[360px] md:h-[440px] lg:h-[700px]"
            />
          </div>

          <div className="order-1 flex flex-col items-center text-center md:order-2 md:items-start md:text-left">
            <p className="juja-annyeong mb-30 text-4xl sm:text-5xl md:text-6xl lg:text-7xl">
              Annyeong!
            </p>


            <img
              src={HERO_LOGO}
              alt="Juja Brew & Bites"
              className="mb-20 h-24 w-auto object-contain sm:h-32 md:h-36 lg:h-40"
            />

            <div className="max-w-xl text-center text-[12px] mb-30 uppercase leading-7 tracking-[0.12em] text-slate-600 sm:text-sm md:text-left">
              <span>Milk Tea</span>
              <span className="px-2 text-[#ff8389]">&bull;</span>
              <span>Coffee</span>
              <span className="px-2 text-[#ff8389]">&bull;</span>
              <span>Ice Cream</span>
              <span className="px-2 text-[#ff8389]">&bull;</span>
              <span>Chicken</span>
              <br className="hidden sm:block" />
              <span>Waffle</span>
              <span className="px-2 text-[#ff8389]">&bull;</span>
              <span>Sandwich</span>
              <span className="px-2 text-[#ff8389]">&bull;</span>
              <span>Rice in a Box</span>
            </div>

            <div className="mt-6 flex w-full max-w-md flex-col gap-3 sm:flex-row md:max-w-none">
              <Link
                href="/menu"
                className="flex-1 rounded-full bg-[#087830] px-7 py-3 text-center text-xs uppercase tracking-widest text-white shadow-[0_14px_28px_rgba(8,120,48,0.18)] transition hover:bg-[#066829]"
              >
                View Menu
              </Link>
              <Link
                href="https://customer.jujabrewandbites.com/function-room"
                className="flex-1 rounded-full border border-[#087830] bg-white/80 px-7 py-3 text-center text-xs uppercase tracking-widest text-[#087830] transition hover:bg-[#e9f7ef]"
              >
                Function Room
              </Link>
            </div>
          </div>
        </div>
      </section>
      {/* On desktop, the footer is locked on screen. On mobile, it acts as the natural bottom of the scroll chain. */}
      <Footer />
    </div>
  );
}

