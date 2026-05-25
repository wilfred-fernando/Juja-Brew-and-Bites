"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

// ─── Shared Nav ───────────────────────────────────────────────────────────────
function Nav({ active }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const links = [
    ["home", "Home", "/"],
    ["menu", "Menu", "/menu"],
    ["promo", "Promos", "/promo"],
    ["function room", "Function Room", "/function-room"],
    ["about", "About Us", "/about"],
  ];

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ${
      scrolled ? "bg-white/96 backdrop-blur-2xl shadow-[0_1px_30px_rgba(0,0,0,0.08)]" : "bg-transparent"
    }`}>
      <div className="max-w-7xl mx-auto px-6 lg:px-12 flex items-center justify-between h-20">
        <Link href="/" className="flex-shrink-0">
          <img src={LOGO} alt="Juja" className="h-14 md:h-16 w-auto object-contain transition-all duration-300 hover:scale-105 drop-shadow-sm" />
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {links.map(([id, label, href]) => (
            <Link key={id} href={href}
              className={`relative text-[12px] font-bold uppercase tracking-[0.18em] transition-all duration-300 group pb-1 ${
                active === id ? "text-[#FC687D]" : "text-slate-600 hover:text-slate-900"
              }`}>
              {label}
              <span className={`absolute bottom-0 left-0 h-[3px] rounded-full bg-gradient-to-r from-[#FC687D] to-rose-400 transition-all duration-350 ${
                active === id ? "w-full" : "w-0 group-hover:w-full"
              }`} />
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/login"
            className="text-[11px] font-bold uppercase tracking-widest px-5 py-2.5 rounded-full border border-slate-200 text-slate-500 hover:border-[#FC687D] hover:text-[#FC687D] hover:bg-rose-50 transition-all duration-300">
            Login
          </Link>         
        </div>

        <button className="md:hidden p-2" onClick={() => setOpen(!open)}>
          <div className="w-5 space-y-[5px]">
            <span className={`block h-[2px] bg-slate-800 rounded transition-all duration-300 ${open ? "rotate-45 translate-y-[7px]" : ""}`} />
            <span className={`block h-[2px] bg-slate-800 rounded transition-all duration-300 ${open ? "opacity-0" : ""}`} />
            <span className={`block h-[2px] bg-slate-800 rounded transition-all duration-300 ${open ? "-rotate-45 -translate-y-[7px]" : ""}`} />
          </div>
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-white/98 backdrop-blur-xl border-t border-slate-100 shadow-2xl px-6 py-6 flex flex-col gap-4">
          {links.map(([, l, h]) => (
            <Link key={l} href={h} onClick={() => setOpen(false)}
              className="text-slate-800 font-bold uppercase tracking-widest text-xs hover:text-[#FC687D] transition py-1">{l}</Link>
          ))}
          <Link href="/order" onClick={() => setOpen(false)}
            className="mt-2 py-3 rounded-full bg-[#FC687D] text-white font-normal text-xs text-center uppercase tracking-widest hover:bg-rose-500 transition-colors">
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
    <footer className="bg-slate-900 text-slate-400 pt-20 pb-10 px-6">
      <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-14 mb-14">
        <div>
          <img src={LOGO} alt="Juja" className="h-16 w-auto object-contain mb-5 brightness-0 invert opacity-60" />
          <p className="text-slate-400 text-sm leading-7">Your premier destination for specialty brews and artisan bites in the heart of Quezon City.</p>
        </div>
        <div>
          <p className="text-white/60 font-bold mb-5 uppercase text-[10px] tracking-[0.3em]">Explore</p>
          <div className="space-y-3">
            {[["Home","/"],["Menu","/menu"],["Promos","/promo"],["About Us","/about"],["Order Online","/order"]].map(([l,h]) => (
              <Link key={l} href={h}
                className="block text-slate-400 hover:text-[#FC687D] transition-colors duration-200 text-sm tracking-wide">{l}</Link>
            ))}
          </div>
        </div>
        <div>
          <p className="text-white/60 font-bold mb-5 uppercase text-[10px] tracking-[0.3em]">Find Us</p>
          <div className="space-y-3.5 text-sm text-slate-400">
            <p className="flex gap-3 items-start"><span className="text-[#FC687D] mt-0.5 flex-shrink-0">📍</span>36D Visayas Ave., Pasong Tamo, Quezon City</p>
            <p className="flex gap-3"><span className="text-[#FC687D] flex-shrink-0">📞</span>0939-9228383</p>
            <p className="flex gap-3"><span className="text-[#FC687D] flex-shrink-0">🕙</span>Store: 10AM – 12MN daily</p>
            <p className="flex gap-3"><span className="text-[#FC687D] flex-shrink-0">🏠</span>Function Room: 10AM – 2AM</p>
          </div>
        </div>
      </div>
      <div className="max-w-6xl mx-auto pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-3">
        <p className="text-slate-500 text-[11px] tracking-[0.2em] uppercase">© {new Date().getFullYear()} Juja 주자 Brew & Bites · All rights reserved</p>
        <p className="text-slate-500 text-[11px]">Pasong Tamo · Quezon City · Philippines</p>
      </div>
    </footer>
  );
}

// ─── Main About Page ──────────────────────────────────────────────────────────
export default function About() {
  return (
    <div className="min-h-screen bg-white" style={{ fontFamily:"'Inter',system-ui,sans-serif" }}>
      <Nav active="about" />

      {/* ═══ SOFT HERO ═══ */}
      <div className="relative overflow-hidden bg-[#FFF5F7]" style={{ paddingTop:"7.5rem", paddingBottom:"5rem", borderBottom: "1px solid #ffe4e6" }}>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[180px] pointer-events-none"
          style={{ background:"radial-gradient(ellipse,rgba(252,104,125,0.15) 0%,transparent 70%)", filter:"blur(55px)" }} />
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage:"radial-gradient(rgba(252,104,125,0.8) 1px,transparent 1px)", backgroundSize:"26px 26px" }} />
        
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
          <img src={LOGO} alt="Juja" className="h-24 md:h-28 w-auto object-contain mx-auto mb-6 drop-shadow-sm" />
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full text-[10px] font-normal uppercase tracking-[0.25em] bg-white text-[#FC687D] border border-rose-100 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FC687D] animate-pulse" />
            Our Story
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold text-slate-800 tracking-tight mb-4">
            About <span className="text-[#FC687D]">Juja</span> 주자
          </h1>
          <p className="text-slate-500 text-sm font-medium max-w-md mx-auto leading-relaxed">
            A cozy hangout where great brews meet amazing bites — all served with Korean-inspired warmth.
          </p>
        </div>
      </div>

      {/* ═══ STORY ═══ */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div className="animate-in fade-in slide-in-from-left-8 duration-700">
            <p className="text-[#FC687D] uppercase tracking-[0.25em] text-[10px] font-normal mb-3">Who We Are</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-800 tracking-tight mb-6 leading-tight">
              Born from a Passion<br />for Good Food
            </h2>
            <p className="text-slate-500 mb-5 font-medium leading-relaxed text-sm">
              Juja 주자 Brew & Bites is your neighborhood cafe and food hub, born from a deep love for great food and
              even better company. We blend Filipino comfort food with Korean-inspired flavors to create an experience that's uniquely ours.
            </p>
            <p className="text-slate-500 mb-5 font-medium leading-relaxed text-sm">
              Whether you're grabbing a quick milk tea, feasting on our famous unli wings, or celebrating a special event
              in our function room — Juja is always the place to be.
            </p>
            <p className="text-slate-500 font-medium leading-relaxed text-sm">
              Every visit should feel like coming home — warm, satisfying, and worth sharing with people you love.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-right-8 duration-700">
            {[
              { num:"170+", label:"Menu Items", icon:"🍽" },
              { num:"11", label:"Categories", icon:"📋" },
              { num:"Daily", label:"Fresh & Open", icon:"🕙" },
              { num:"🤍", label:"Made with Love", icon:"" },
            ].map(s => (
              <div key={s.label}
                className="group bg-[#FFF5F7] rounded-3xl p-6 text-center border border-rose-50
                  hover:bg-[#FC687D] hover:shadow-[0_8px_20px_rgba(252,104,125,0.2)] hover:-translate-y-1
                  transition-all duration-300">
                <div className="text-3xl font-normal text-[#FC687D] mb-1 group-hover:text-white transition-colors">{s.num}</div>
                <div className="text-slate-400 text-[11px] font-bold group-hover:text-rose-100 transition-colors uppercase tracking-widest">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ WHAT WE OFFER ═══ */}
      <section className="py-24 px-6 bg-[#FFF5F7]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[#FC687D] uppercase tracking-[0.25em] text-[10px] font-normal mb-3">On the Menu</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-800 tracking-tight">Something for Everyone</h2>
            <div className="w-12 h-[3px] rounded-full bg-[#FC687D] mx-auto mt-4" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { icon:"🍗", label:"Chicken" }, { icon:"🧋", label:"Milk Tea" },
              { icon:"☕", label:"Coffee" },  { icon:"🧇", label:"Waffles" },
              { icon:"🍝", label:"Pasta" },   { icon:"🍱", label:"Rice Meals" },
              { icon:"🍳", label:"Breakfast" },{ icon:"🫕", label:"Group Trays" },
            ].map(v => (
              <Link key={v.label} href="/menu"
                className="group p-8 bg-white border border-rose-50 rounded-3xl text-center shadow-sm
                  hover:bg-[#FC687D] hover:border-transparent hover:shadow-[0_10px_30px_rgba(252,104,125,0.2)] hover:-translate-y-1.5 transition-all duration-300">
                <div className="text-4xl mb-3 group-hover:scale-110 transition-transform duration-300">{v.icon}</div>
                <p className="font-bold text-slate-700 text-[10px] uppercase tracking-widest group-hover:text-white transition-colors">{v.label}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FUNCTION ROOM ═══ */}
      <section className="py-24 px-6 bg-white border-b border-rose-50">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div className="rounded-3xl p-12 border border-rose-100 text-center relative overflow-hidden shadow-sm"
            style={{ background:"linear-gradient(145deg,#ffffff,#FFF5F7)" }}>
            <div className="absolute top-0 right-0 w-40 h-40 opacity-20 pointer-events-none"
              style={{ background:"radial-gradient(circle,#FC687D,transparent 65%)", filter:"blur(30px)" }} />
            <div className="relative z-10">
              <div className="text-7xl mb-5 drop-shadow-sm">🏠</div>
              <h3 className="text-2xl font-extrabold text-slate-800 mb-3 tracking-tight">Function Room</h3>
              <p className="text-slate-500 mb-6 font-medium leading-relaxed text-sm">
                Perfect for birthdays, team outings, and special events of all sizes.
              </p>
              <div className="inline-flex items-center gap-2 bg-white border border-rose-100 text-[#FC687D] font-bold text-[11px] uppercase tracking-widest px-5 py-2.5 rounded-full shadow-sm">
                🕙 Open 10:00 AM – 2:00 AM
              </div>
            </div>
          </div>
          <div>
            <p className="text-[#FC687D] uppercase tracking-[0.2em] text-[10px] font-normal mb-3">Host Your Next Event</p>
            <h2 className="text-3xl font-extrabold text-slate-800 mb-5 tracking-tight">Make It Memorable at Juja</h2>
            <p className="text-slate-500 mb-4 font-medium leading-relaxed text-sm">
              Our function room is available for advance booking. Space, food, and drinks — all ready for your celebration.
            </p>
            <p className="text-slate-500 mb-8 font-medium leading-relaxed text-sm">
              We also take advance orders for group trays, catering, and corporate events.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a href="tel:09399228383"
                className="px-8 py-3.5 rounded-full font-bold text-xs uppercase tracking-widest text-white text-center transition-all duration-300 hover:-translate-y-0.5 bg-[#FC687D] shadow-[0_8px_20px_rgba(252,104,125,0.3)]">
                📞 Call to Book
              </a>
              <Link href="/menu"
                className="px-8 py-3.5 rounded-full font-bold text-xs uppercase tracking-widest text-center
                  border border-slate-200 text-slate-600 hover:border-[#FC687D] hover:bg-rose-50 hover:text-[#FC687D] transition-all duration-300">
                View Group Trays
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ HOURS & LOCATION ═══ */}
      <section className="py-24 px-6 bg-[#FFF5F7]">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12">
          <div>
            <p className="text-[#FC687D] uppercase tracking-[0.2em] text-[10px] font-normal mb-3">Hours</p>
            <h2 className="text-2xl font-extrabold text-slate-800 mb-7 tracking-tight">When We're Open</h2>
            <div className="space-y-4">
              {[
                { label:"Store (Daily)", hours:"10:00 AM – 12:00 MN", icon:"🏪" },
                { label:"Function Room (Daily)", hours:"10:00 AM – 2:00 AM", icon:"🏠" },
              ].map(h => (
                <div key={h.label}
                  className="group flex justify-between items-center py-6 px-8 bg-white rounded-3xl border border-rose-50 shadow-sm
                    hover:border-[#FC687D] hover:shadow-md transition-all duration-300">
                  <span className="text-slate-600 font-normal text-sm flex items-center gap-3 group-hover:text-slate-800 transition-colors">
                    <span className="text-xl">{h.icon}</span> {h.label}
                  </span>
                  <span className="text-[#FC687D] font-normal text-sm">{h.hours}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[#FC687D] uppercase tracking-[0.2em] text-[10px] font-normal mb-3">Location</p>
            <h2 className="text-2xl font-extrabold text-slate-800 mb-7 tracking-tight">Find Us</h2>
            <div className="bg-white rounded-3xl p-8 border border-rose-50 shadow-sm space-y-6">
              {[
                { icon:"📍", label:"Address", val:"36D Visayas Ave., Pasong Tamo, Quezon City" },
                { icon:"📞", label:"Mobile", val:"0939-9228383", link:"tel:09399228383" },
                { icon:"🕙", label:"Store Hours", val:"10:00 AM – 12:00 MN daily" },
              ].map(i => (
                <div key={i.label} className="flex gap-5 items-start">
                  <span className="text-2xl mt-0.5 flex-shrink-0 drop-shadow-sm">{i.icon}</span>
                  <div>
                    <p className="text-slate-800 font-extrabold text-sm tracking-wide">{i.label}</p>
                    {i.link
                      ? <a href={i.link} className="text-[#FC687D] font-bold text-sm mt-1 block hover:text-rose-600 transition">{i.val}</a>
                      : <p className="text-slate-500 font-medium text-sm mt-1 leading-relaxed">{i.val}</p>
                    }
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="py-24 px-6 text-center relative overflow-hidden bg-white border-t border-rose-50">
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage:"radial-gradient(rgba(252,104,125,0.8) 1px,transparent 1px)", backgroundSize:"28px 28px" }} />
        <div className="relative">
          <p className="text-[#FC687D] uppercase tracking-[0.3em] text-[10px] font-normal mb-3">Let's Eat</p>
          <h2 className="text-4xl md:text-5xl font-extrabold text-slate-800 tracking-tight mb-5">Ready to Order?</h2>
          <p className="text-slate-500 font-medium mb-10 max-w-md mx-auto text-sm leading-relaxed">
            Dine in, take out, or order online — we're always ready to serve you.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/order"
              className="px-12 py-4 rounded-full font-bold text-sm uppercase tracking-widest text-white transition-all duration-300 hover:-translate-y-1 bg-[#FC687D] shadow-[0_10px_30px_rgba(252,104,125,0.3)]">
              Order Online →
            </Link>
            <Link href="/menu"
              className="px-12 py-4 rounded-full font-bold text-sm uppercase tracking-widest transition-all duration-300 hover:-translate-y-1 bg-white border border-slate-200 text-slate-600 hover:border-[#FC687D] hover:text-[#FC687D] shadow-sm">
              Browse Menu
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}