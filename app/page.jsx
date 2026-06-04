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
    <footer className="bg-slate-900 text-slate-400 py-6 md:py-8 px-6 flex-none">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10 mb-4 md:mb-6">
        {/* Brand Block */}
        <div className="flex flex-col justify-center">
          <p className="text-slate-400 mb-2 leading-relaxed max-w-sm">
            ROMANS 15:13
          </p>
          <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
            May the God of hope fill you with all joy and peace...
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
      <section className="relative flex-none md:flex-1 flex items-center justify-center overflow-hidden px-5 py-5 sm:px-8 sm:py-8 md:px-10 md:py-6">
        <div className="relative z-10 mx-auto grid h-full w-full max-w-6xl items-center gap-4 sm:gap-6 md:grid-cols-[0.9fr_1.1fr] md:gap-10">
          <div className="order-2 flex max-h-[34vh] overflow-hidden justify-center md:order-1 md:max-h-none md:overflow-visible md:justify-end">
            <img
              src={HERO_MASCOT}
              alt="Juja mascot"
              className="h-[250px] w-auto object-contain object-top drop-shadow-[0_20px_35px_rgba(15,23,42,0.14)] sm:h-[340px] md:h-[440px] lg:h-[700px]"
            />
          </div>

          <div className="order-1 pt-20 md:pt-0 flex flex-col items-center text-center md:order-2 md:items-start md:text-left">
          <p className="juja-annyeong mb-3 text-4xl sm:text-5xl md:mb-30 md:text-6xl lg:text-7xl">
            Annyeong!
          </p>

            
            <img
              src={HERO_LOGO}
              alt="Juja Brew & Bites"
              className="mb-5 h-24 w-auto max-w-[82vw] object-contain sm:h-32 md:mb-20 md:h-36 lg:h-40"
            />

            <div className="max-w-[92vw] text-center text-[12px] font-bold mb-6 uppercase leading-6 tracking-[0.05em] text-slate-600 sm:text-sm md:mb-30 md:max-w-xl md:text-center md:text-[14px] md:leading-7 md:tracking-[0.12em]">
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

            <div className="mt-2 flex w-sm max-w-md flex-col gap-3 sm:flex-row md:mt-6 md:max-w-none">
              <Link
                href="/menu"
                className="flex-1 rounded-full bg-[#087830] px-7 py-3 text-center text-xs uppercase tracking-widest text-white shadow-[0_14px_28px_rgba(8,120,48,0.18)] transition hover:bg-[#066829]"
              >
                View Menu
              </Link>
              <Link
                href="https://www.jujabrewandbites.com/function-room"
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

