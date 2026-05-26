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

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

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
    // Changed from fixed to relative/flex-none so it takes layout space predictably without causing overflows
    <nav className="relative w-full z-50 bg-white/95 backdrop-blur-2xl shadow-[0_1px_30px_rgba(0,0,0,0.05)] flex-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 flex items-center justify-between h-16 md:h-20">
        <Link href="/" className="flex-shrink-0">
          <img src={LOGO} alt="Juja" className="h-10 sm:h-12 md:h-14 w-auto object-contain transition-all duration-300 hover:scale-105 drop-shadow-sm" />
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
            className="text-[11px] font-semibold uppercase tracking-widest px-5 py-2 rounded-full border border-slate-200 text-slate-500 hover:border-[#FC687D] hover:text-[#FC687D] hover:bg-rose-50 transition-all duration-300"
          >
            Login
          </Link>          
        </div>

        {/* Mobile Toggle */}
        <button className="md:hidden p-2 text-slate-800" onClick={() => setOpen(!open)} aria-label="Toggle Menu">
          <div className="w-5 space-y-[5px]">
            <span className={`block h-[2px] bg-current rounded-full transition-all duration-300 ${open ? "rotate-45 translate-y-[7px]" : ""}`} />
            <span className={`block h-[2px] bg-current rounded-full transition-all duration-300 ${open ? "opacity-0" : ""}`} />
            <span className={`block h-[2px] bg-current rounded-full transition-all duration-300 ${open ? "-rotate-45 -translate-y-[7px]" : ""}`} />
          </div>
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {open && (
        <div className="absolute top-16 left-0 w-full z-50 md:hidden bg-white/98 backdrop-blur-xl border-t border-slate-100 shadow-2xl px-6 py-4 flex flex-col gap-2 animate-in fade-in slide-in-from-top-4 duration-300">
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
    // Replaced large margin-top and padding-top with tight, proportional paddings suitable for a viewport container
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
            <p className="text-slate-500 text-[11px]">Store: 10AM–12MN · Function: 10AM–2AM</p>
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

export default function Home() {
  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Nav active="home" />

      {/* ═══ HERO ═══ */}
      <section className="relative flex-1 flex items-center justify-center overflow-hidden bg-gradient-to-b from-[#FFF5F7] to-white p-6">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/10 w-[400px] md:w-[600px] h-[400px] md:h-[600px] rounded-full opacity-25"
            style={{ background: "radial-gradient(circle,#FC687D 0%,transparent 65%)", filter: "blur(90px)" }} />
        </div>

        {/* Increased space-y layout to spread elements out organically within the newly reclaimed screen real estate */}
        <div className="relative z-10 text-center max-w-5xl mx-auto flex flex-col items-center justify-center h-full space-y-5 md:space-y-7">
          
          {/* Increased logo size significantly (from max md:h-28 to md:h-48) */}
          <img src={LOGO} alt="Juja Brew & Bites"
            className="h-24 sm:h-36 md:h-44 lg:h-48 w-auto object-contain mx-auto drop-shadow-md transition-all duration-300" />
            
          {/* Bumped up description and pill text scaling */}
          <p className="text-slate-500 text-sm sm:text-base md:text-lg lg:text-xl max-w-2xl mx-auto font-medium tracking-wide">
            Chicken · Milk Tea · Coffee · Waffle · Rice in a Box
          </p>

          <div className="inline-flex items-center gap-2 px-5 py-1.5 rounded-full text-[10px] md:text-[11px] font-bold uppercase tracking-[0.25em] bg-white text-[#FC687D] border border-rose-100 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FC687D] animate-pulse" />
            food · drinks · Quezon City
          </div>

          {/* Drastically expanded typography sizes (from md:text-5xl to text-5xl/md:text-7xl/lg:text-8xl) */}
          <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black leading-[0.95] tracking-tight text-slate-800 uppercase">
            brewing with<br />
            <span className="text-[#FC687D] relative">gratitude</span>
          </h1>

          {/* Slightly larger, bold CTA interactive targets */}
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto pt-3">
            <Link href="/order"
              className="w-full sm:w-auto px-10 py-4 rounded-full font-bold text-xs md:text-sm text-center uppercase tracking-widest text-white transition-all duration-300 bg-[#FC687D] shadow-[0_10px_25px_rgba(252,104,125,0.3)] hover:bg-rose-500 hover:-translate-y-0.5">
              Order Online →
            </Link>
            <Link href="/menu"
              className="w-full sm:w-auto px-10 py-4 rounded-full font-bold text-xs md:text-sm text-center uppercase tracking-widest bg-white text-slate-700 border border-slate-200 hover:border-[#FC687D] hover:text-[#FC687D] hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
              View Full Menu
            </Link>
          </div>
        </div>
      </section>

      {/* Footer element takes its static height and locks itself to the bottom */}
      <Footer />
    </div>
  );
}