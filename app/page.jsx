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
const HERO_MASCOT = "https://images.jujabrewandbites.com/juja%204.png";
const HERO_LOGO = "https://images.jujabrewandbites.com/juja%203.png";

// ─── Shared Nav ───────────────────────────────────────────────────────────────
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
        </div>
      )}
    </nav>
  );
}

// ─── Shared Footer ────────────────────────────────────────────────────────────
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    // Configured mobile-first scroll wrapper swap (min-h-screen md:h-screen overflow-y-auto md:overflow-hidden)
    <div className="juja-page-bg min-h-screen md:h-screen w-screen overflow-y-auto md:overflow-hidden flex flex-col bg-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Nav active="home" />

      {/* HERO */}
      <section className="relative flex-none md:flex-1 flex min-h-[calc(65svh-1.5rem)] items-center justify-center overflow-hidden px-3 py-0 sm:px-8 sm:py-6 md:min-h-0 md:px-10 md:py-6">
        <div className="relative z-10 mx-auto grid h-full w-full max-w-6xl grid-cols-[0.42fr_0.58fr] items-center gap-1 sm:gap-6 md:gap-8 lg:gap-10">
          <div className="order-1 flex h-full items-center justify-end overflow-visible md:justify-end">
            <img
              src={HERO_MASCOT}
              alt="Juja mascot"
              className="h-[30svh] max-h-[390px] w-auto object-contain object-center drop-shadow-[0_20px_35px_rgba(15,23,42,0.14)] sm:h-[340px] md:h-[60vh] md:max-h-none md:translate-y-4 lg:h-[68vh] lg:translate-y-6"
            />
          </div>

          <div className="order-2 flex min-w-0 flex-col items-center pt-0 text-center">
          <p className="juja-annyeong mb-2 text-center text-[clamp(1.55rem,8vw,2.35rem)] sm:text-5xl md:mb-6 md:text-6xl lg:text-7xl">
            Annyeong!
          </p>

            
            <img
              src={HERO_LOGO}
              alt="Juja Brew & Bites"
              className="mb-3 h-auto w-full max-w-[190px] object-contain sm:h-32 sm:w-auto sm:max-w-none md:mb-6 md:h-36 lg:h-40"
            />

            <div className="mb-4 flex w-full max-w-[210px] flex-col items-center gap-1 text-center text-[10px] font-bold uppercase leading-5 tracking-[0.04em] text-slate-600 sm:max-w-xl sm:text-sm md:mb-6 md:text-[14px] md:leading-7 md:tracking-[0.12em]">
              <div className="flex flex-wrap items-center justify-center whitespace-nowrap">
                <span>Milk Tea</span>
                <span className="px-2 text-[#ff8389]">&bull;</span>
                <span>Coffee</span>
                <span className="px-2 text-[#ff8389]">&bull;</span>
                <span>Ice Cream</span>
                <span className="px-2 text-[#ff8389]">&bull;</span>
                <span>Chicken</span>
              </div>
              <div className="flex flex-wrap items-center justify-center whitespace-nowrap">
                <span>Waffle</span>
                <span className="px-2 text-[#ff8389]">&bull;</span>
                <span>Sandwich</span>
                <span className="px-2 text-[#ff8389]">&bull;</span>
                <span>Rice in a Box</span>
              </div>
            </div>

            <div className="mt-0 flex w-full max-w-[220px] flex-col gap-2 sm:max-w-md sm:flex-row md:max-w-md md:gap-3">
              <Link
                href="/menu"
                className="flex-1 rounded-full bg-[#087830] px-4 py-2.5 text-center text-[10px] uppercase tracking-widest text-white shadow-[0_14px_28px_rgba(8,120,48,0.18)] transition hover:bg-[#066829] md:px-7 md:py-3 md:text-xs"
              >
                View Menu
              </Link>
              <Link
                href="https://www.jujabrewandbites.com/function-room"
                className="flex-1 rounded-full border border-[#087830] bg-white/80 px-4 py-2.5 text-center text-[10px] uppercase tracking-widest text-[#087830] transition hover:bg-[#e9f7ef] md:px-7 md:py-3 md:text-xs"
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

