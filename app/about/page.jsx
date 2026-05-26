"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

// ─── Shared Nav (Left untouched as requested) ───────────────────────────────────
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

// ─── Shared Footer (Left untouched as requested) ─────────────────────────────────
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

// ─── Main About Page ──────────────────────────────────────────────────────────
export default function About() {
  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Nav active="about" />

      {/* ═══ DYNAMIC MAIN CONTAINER ═══ */}
      {/* flex-1 takes remaining height, overflow-y-auto ensures content flows naturally inside if squeezed */}
      <main className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        
        {/* ═══ REVERTED ORIGINAL SOFT HERO DESIGN ═══ */}
        {/* Restored the styling layout footprint exactly as requested */}
        <div className="relative overflow-hidden bg-[#FFF5F7] flex-none" style={{ paddingTop: "4rem", paddingBottom: "3.5rem", borderBottom: "1px solid #ffe4e6" }}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[180px] pointer-events-none"
            style={{ background: "radial-gradient(ellipse,rgba(252,104,125,0.15) 0%,transparent 70%)", filter: "blur(55px)" }} />
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: "radial-gradient(rgba(252,104,125,0.8) 1px,transparent 1px)", backgroundSize: "26px 26px" }} />
          
          <div className="relative z-10 max-w-3xl mx-auto px-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
            <img src={LOGO} alt="Juja" className="h-16 md:h-20 w-auto object-contain mx-auto mb-4 drop-shadow-sm" />
            <div className="inline-flex items-center gap-2 mb-3 px-4 py-1.5 rounded-full text-[10px] font-normal uppercase tracking-[0.25em] bg-white text-[#FC687D] border border-rose-100 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FC687D] animate-pulse" />
              Our Story
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold text-slate-800 tracking-tight mb-3">
              About <span className="text-[#FC687D]">Juja</span> 주자
            </h1>
            <p className="text-slate-500 text-xs md:text-sm font-medium max-w-md mx-auto leading-relaxed">
              A cozy hangout where great brews meet amazing bites — all served with Korean-inspired warmth.
            </p>
          </div>
        </div>

        {/* ═══ STORY CONTENT SECTION ═══ */}
        {/* Adjusted padding slightly to balance vertical allocation across laptops and displays */}
        <section className="py-8 md:py-12 px-6 bg-white flex-1 flex items-center">
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8 md:gap-16 items-center w-full">
            <div className="animate-in fade-in slide-in-from-left-8 duration-700 space-y-3">
              <div>
                <p className="text-[#FC687D] uppercase tracking-[0.25em] text-[10px] font-normal mb-1">Who We Are</p>
                <h2 className="text-xl md:text-3xl font-extrabold text-slate-800 tracking-tight leading-tight">
                  Born from a Passion<br />for Good Food
                </h2>
              </div>
              <p className="text-slate-500 font-medium leading-relaxed text-xs md:text-sm">
                Juja 주자 Brew & Bites is your neighborhood cafe and food hub, born from a deep love for great food and
                even better company. We blend Filipino comfort food with Korean-inspired flavors to create an experience that's uniquely ours.
              </p>
              <p className="text-slate-500 font-medium leading-relaxed text-xs md:text-sm">
                Whether you're grabbing a quick milk tea, feasting on our famous unli wings, or celebrating a special event
                in our function room — Juja is always the place to be.
              </p>
              <p className="text-slate-500 font-medium leading-relaxed text-xs md:text-sm">
                Every visit should feel like coming home — warm, satisfying, and worth sharing with people you love.
              </p>
            </div>
            
            {/* Stats Matrix Grid Layout */}
            <div className="grid grid-cols-2 gap-3.5 animate-in fade-in slide-in-from-right-8 duration-700">
              {[
                { num: "170+", label: "Menu Items" },
                { num: "11", label: "Categories" },
                { num: "Daily", label: "Fresh & Open" },
                { num: "🤍", label: "Made with Love" },
              ].map(s => (
                <div key={s.label}
                  className="group bg-[#FFF5F7] rounded-2xl p-4 md:p-5 text-center border border-rose-50
                    hover:bg-[#FC687D] hover:shadow-[0_8px_20px_rgba(252,104,125,0.15)] hover:-translate-y-0.5
                    transition-all duration-300">
                  <div className="text-2xl font-bold text-[#FC687D] mb-0.5 group-hover:text-white transition-colors">{s.num}</div>
                  <div className="text-slate-400 text-[9px] md:text-[10px] font-bold group-hover:text-rose-100 transition-colors uppercase tracking-widest">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}