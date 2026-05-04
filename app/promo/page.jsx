"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

const PROMOS = [
  {
    id: 1,
    badge: "🔥 Limited Time",
    title: "Unli Wings Tuesday",
    subtitle: "Every Wednesday",
    desc: "Unlimited chicken wings — all day, every Wednesday! Choose from 10 flavors. Dine-in only.",
    tag: "Dine-In Only",
    color: "#1EBBA3", // Teal
    icon: "🍗",
    validUntil: "Every Wednesday",
    terms: "Dine-in only. No take-out. One customer per seat.",
  },
  {
    id: 2,
    badge: "🧋 New",
    title: "Buy 2 Get 1 Free",
    subtitle: "Milk Tea & Frappe",
    desc: "Order any 2 drinks from our Milk Tea or Frappe menu and get a 3rd one FREE! Mix and match.",
    tag: "All Day",
    color: "#1A1A1A", // Dark Brutalist
    icon: "🧋",
    validUntil: "Ongoing",
    terms: "Drinks of equal or lesser value. Cannot be combined with other promos.",
  },
  {
    id: 3,
    badge: "☀️ Morning Deal",
    title: "Breakfast Combo",
    subtitle: "10AM – 12NN",
    desc: "Get any All-Day Breakfast item + a hot coffee or milk tea at a special combo price. Perfect morning fuel!",
    tag: "10AM–12NN",
    color: "#159a85", // Darker Teal
    icon: "🍳",
    validUntil: "Daily",
    terms: "Available for dine-in and take-out. Coffee/milk tea included.",
  },
  {
    id: 4,
    badge: "🎂 Special",
    title: "Celebrant Treat",
    subtitle: "On Your Birthday",
    desc: "Celebrating your birthday at Juja? Get a FREE waffle or mini donut on us! Just show a valid ID.",
    tag: "Birthday Only",
    color: "#2E2E2E", // Gray/Black
    icon: "🧇",
    validUntil: "On your birthday",
    terms: "Valid ID required. One per person per birthday. Dine-in only.",
  },
  {
    id: 5,
    badge: "👥 Group Deal",
    title: "Group Tray Special",
    subtitle: "For 10+ People",
    desc: "Book a group tray order for 10 or more and get a complimentary pitcher of iced tea or lemonade.",
    tag: "Advance Order",
    color: "#1EBBA3", // Teal
    icon: "🫕",
    validUntil: "Advance booking required",
    terms: "Must book at least 24 hours in advance. Call to reserve.",
  },
  {
    id: 6,
    badge: "📱 Social",
    title: "Post & Save",
    subtitle: "Tag us @juja",
    desc: "Post a photo at Juja and tag us on any social platform. Show your post to the cashier and get ₱20 off your order!",
    tag: "₱20 Off",
    color: "#1A1A1A", // Dark Brutalist
    icon: "📸",
    validUntil: "Ongoing",
    terms: "Public post required. One discount per transaction. Cannot combine with other promos.",
  },
];

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
    ["about", "About Us", "/about"],
  ];

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ${
      scrolled ? "bg-white/96 backdrop-blur-2xl shadow-[0_1px_30px_rgba(0,0,0,0.10)]" : "bg-transparent"
    }`}>
      <div className="max-w-7xl mx-auto px-6 lg:px-12 flex items-center justify-between h-20">
        <Link href="/" className="flex-shrink-0">
          <img src={LOGO} alt="Juja" className={`h-16 md:h-20 w-auto object-contain transition-all duration-300 hover:scale-105 drop-shadow ${scrolled ? 'filter-none' : 'brightness-0 invert'}`} />
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {links.map(([id, label, href]) => (
            <Link key={id} href={href}
              className={`relative text-[12px] font-bold uppercase tracking-[0.18em] transition-all duration-300 group pb-1 ${
                active === id ? "text-[#1EBBA3]" : (scrolled ? "text-neutral-600 hover:text-neutral-900" : "text-white/70 hover:text-white")
              }`}>
              {label}
              <span className={`absolute bottom-0 left-0 h-[2px] rounded-full bg-[#1EBBA3] transition-all duration-350 ${
                active === id ? "w-full" : "w-0 group-hover:w-full"
              }`} />
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/login"
            className={`text-[11px] font-bold uppercase tracking-widest px-5 py-2.5 rounded-full border transition-all duration-300 ${
              scrolled ? "border-neutral-200 text-neutral-500 hover:border-[#1EBBA3] hover:text-[#1EBBA3] hover:bg-[#1EBBA3]/10" 
                       : "border-white/30 text-white hover:border-white hover:bg-white/10"
            }`}>
            Staff Login
          </Link>
          <Link href="/order"
            className="text-[11px] font-black uppercase tracking-widest px-7 py-3 rounded-full bg-[#1EBBA3] text-white hover:bg-[#159a85] hover:shadow-[0_6px_28px_rgba(30,187,163,0.45)] hover:-translate-y-0.5 transition-all duration-300 shadow-md">
            Order Now →
          </Link>
        </div>

        <button className="md:hidden p-2" onClick={() => setOpen(!open)}>
          <div className="w-5 space-y-[5px]">
            <span className={`block h-[2px] rounded transition-all duration-300 ${open ? "rotate-45 translate-y-[7px] bg-neutral-800" : (scrolled ? "bg-neutral-800" : "bg-white")}`} />
            <span className={`block h-[2px] rounded transition-all duration-300 ${open ? "opacity-0" : (scrolled ? "bg-neutral-800" : "bg-white")}`} />
            <span className={`block h-[2px] rounded transition-all duration-300 ${open ? "-rotate-45 -translate-y-[7px] bg-neutral-800" : (scrolled ? "bg-neutral-800" : "bg-white")}`} />
          </div>
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-white/98 backdrop-blur-xl border-t border-neutral-100 shadow-2xl px-6 py-6 flex flex-col gap-4">
          {links.map(([, l, h]) => (
            <Link key={l} href={h} onClick={() => setOpen(false)}
              className="text-neutral-800 font-bold uppercase tracking-widest text-xs hover:text-[#1EBBA3] transition py-1">{l}</Link>
          ))}
          <Link href="/order" onClick={() => setOpen(false)}
            className="mt-2 py-3 rounded-full bg-[#1EBBA3] text-white font-black text-xs text-center uppercase tracking-widest hover:bg-[#159a85] transition-colors">
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
    <footer style={{ background: "#0c0c0c" }} className="text-neutral-500 pt-20 pb-10 px-6">
      <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-14 mb-14">
        <div>
          <img src={LOGO} alt="Juja" className="h-16 w-auto object-contain mb-5 brightness-0 invert opacity-50" />
          <p className="text-neutral-600 text-sm leading-7">Your premier destination for specialty brews and artisan bites in the heart of Quezon City.</p>
        </div>
        <div>
          <p className="text-white/50 font-bold mb-5 uppercase text-[10px] tracking-[0.3em]">Explore</p>
          <div className="space-y-3">
            {[["Home","/"],["Menu","/menu"],["Promos","/promo"],["About Us","/about"],["Order Online","/order"]].map(([l,h]) => (
              <Link key={l} href={h} className="block text-neutral-600 hover:text-[#1EBBA3] transition-colors duration-200 text-sm tracking-wide">{l}</Link>
            ))}
          </div>
        </div>
        <div>
          <p className="text-white/50 font-bold mb-5 uppercase text-[10px] tracking-[0.3em]">Find Us</p>
          <div className="space-y-3.5 text-sm text-neutral-600">
            <p className="flex gap-3 items-start"><span className="text-[#1EBBA3] mt-0.5 flex-shrink-0">📍</span>36D Visayas Ave., Pasong Tamo, Quezon City</p>
            <p className="flex gap-3"><span className="text-[#1EBBA3] flex-shrink-0">📞</span>0939-9228383</p>
            <p className="flex gap-3"><span className="text-[#1EBBA3] flex-shrink-0">🕙</span>Store: 10AM – 12MN daily</p>
            <p className="flex gap-3"><span className="text-[#1EBBA3] flex-shrink-0">🏠</span>Function Room: 10AM – 2AM</p>
          </div>
        </div>
      </div>
      <div className="max-w-6xl mx-auto pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-3">
        <p className="text-neutral-700 text-[11px] tracking-[0.2em] uppercase">© {new Date().getFullYear()} Juja 주자 Brew & Bites · All rights reserved</p>
        <p className="text-neutral-700 text-[11px]">Pasong Tamo · Quezon City · Philippines</p>
      </div>
    </footer>
  );
}

// ─── Main Promo Page ──────────────────────────────────────────────────────────
export default function PromoPage() {
  const [flipped, setFlipped] = useState(null);

  return (
    <div className="min-h-screen font-sans">
      <Nav active="promo" />

      {/* ═══ HERO ═══ */}
      <div className="relative overflow-hidden" style={{ background:"linear-gradient(160deg,#0c0c0c 0%,#0a1a18 60%,#0c0c0c 100%)", paddingTop:"7.5rem", paddingBottom:"5rem" }}>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] pointer-events-none"
          style={{ background:"radial-gradient(ellipse,rgba(30,187,163,0.15) 0%,transparent 70%)", filter:"blur(60px)" }} />
        <div className="absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage:"radial-gradient(rgba(255,255,255,0.7) 1px,transparent 1px)", backgroundSize:"28px 28px" }} />

        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
          <img src={LOGO} alt="Juja" className="h-28 md:h-36 w-auto object-contain mx-auto mb-5 brightness-0 invert drop-shadow-2xl" />
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-[0.25em]"
            style={{ border:"1px solid rgba(30,187,163,0.3)", color:"#1EBBA3", background:"rgba(30,187,163,0.07)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#1EBBA3] animate-pulse" />
            Exclusive Deals
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-white tracking-tighter uppercase mb-4">
            Promos &amp; <span className="text-[#1EBBA3] font-light">Deals</span>
          </h1>
          <p className="text-neutral-400 text-sm font-medium tracking-wide max-w-md mx-auto leading-relaxed">
            Score amazing deals every time you visit. Check back regularly — we love surprising our guests!
          </p>
        </div>
      </div>

      {/* ═══ PROMO CARDS ═══ */}
      <section className="py-24 px-6 bg-[#F9F7F2]">
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {PROMOS.map((promo, index) => (
              <div key={promo.id} className="animate-in fade-in slide-in-from-bottom-8 duration-700" style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'both' }}>
                <PromoCard promo={promo} flipped={flipped === promo.id} onFlip={() => setFlipped(flipped === promo.id ? null : promo.id)} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ LOYALTY BANNER ═══ */}
      <section className="py-24 px-6 bg-white border-t border-gray-100">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-lg overflow-hidden relative shadow-lg"
            style={{ background:"linear-gradient(135deg,#0c0c0c 0%,#1A1A1A 100%)", padding:"4rem" }}>
            <div className="absolute top-0 right-0 w-64 h-64 opacity-10 pointer-events-none"
              style={{ background:"radial-gradient(circle,#1EBBA3,transparent 65%)", filter:"blur(40px)" }} />
            <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
              <div className="text-7xl flex-shrink-0 opacity-90 drop-shadow-md">🎁</div>
              <div className="flex-1 text-center md:text-left">
                <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-sm text-[10px] font-bold uppercase tracking-widest"
                  style={{ background:"rgba(30,187,163,0.15)", color:"#1EBBA3", border:"1px solid rgba(30,187,163,0.2)" }}>
                  Coming Soon
                </div>
                <h3 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter mb-3">Juja Loyalty Program</h3>
                <p className="text-neutral-400 text-sm font-medium tracking-wide leading-relaxed mb-6 max-w-md">
                  Earn points with every purchase and unlock exclusive rewards, free drinks, and special member-only deals.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
                  <a href="tel:09399228383"
                    className="px-8 py-3 rounded-sm font-bold text-xs uppercase tracking-widest text-white transition-all duration-300 hover:-translate-y-0.5"
                    style={{ background:"#1EBBA3", boxShadow:"0 6px 20px rgba(30,187,163,0.3)" }}>
                    📞 Inquire Now
                  </a>
                  <Link href="/order"
                    className="px-8 py-3 rounded-sm font-bold text-xs uppercase tracking-widest transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/10"
                    style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.15)", color:"rgba(255,255,255,0.9)" }}>
                    Order While You Wait
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SOCIAL STRIP ═══ */}
      <section className="py-20 px-6" style={{ background:"#0c0c0c" }}>
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-neutral-500 text-[10px] font-bold uppercase tracking-[0.3em] mb-4">Stay Updated</p>
          <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-4">Follow Us for More Promos</h3>
          <p className="text-neutral-400 text-sm font-medium tracking-wide mb-10">Tag <span className="text-[#1EBBA3] font-bold">@juja</span> on social media for your ₱20 discount!</p>
          <div className="flex flex-wrap justify-center gap-4">
            <a href="tel:09399228383"
              className="flex items-center gap-2 px-8 py-3.5 rounded-sm text-xs font-bold uppercase tracking-widest text-white transition-all duration-300 hover:-translate-y-0.5 bg-[#1A1A1A] border border-gray-700 hover:border-[#1EBBA3]">
              📞 Call Us
            </a>
            <Link href="/order"
              className="flex items-center gap-2 px-8 py-3.5 rounded-sm text-xs font-bold uppercase tracking-widest text-white transition-all duration-300 hover:-translate-y-0.5 bg-[#1EBBA3] shadow-[0_5px_20px_rgba(30,187,163,0.3)]">
              🛒 Order Now
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

// ─── Promo Card Component ─────────────────────────────────────────────────────
function PromoCard({ promo, flipped, onFlip }) {
  const [hov, setHov] = useState(false);

  return (
    <div
      className="cursor-pointer select-none group"
      style={{ perspective:"1200px", height:"320px" }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onFlip}>
      <div style={{
        position:"relative", width:"100%", height:"100%",
        transformStyle:"preserve-3d",
        transition:"transform 0.6s cubic-bezier(0.25,0.46,0.45,0.94)",
        transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        boxShadow: hov && !flipped ? "0 20px 50px rgba(0,0,0,0.08)" : "0 4px 15px rgba(0,0,0,0.03)",
        borderRadius:"0.5rem",
      }}>
        {/* ── FRONT ── */}
        <div style={{
          position:"absolute", inset:0, backfaceVisibility:"hidden", WebkitBackfaceVisibility:"hidden",
          borderRadius:"0.5rem", overflow:"hidden",
          background:"white", border:"1px solid #f0f0f0",
        }}>
          {/* Color accent bar */}
          <div style={{ height:"4px", background: promo.color }} />
          <div className="p-8 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div className="text-4xl drop-shadow-sm">{promo.icon}</div>
              <span className="text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-sm"
                style={{ background:`${promo.color}10`, color: promo.color, border:`1px solid ${promo.color}30` }}>
                {promo.tag}
              </span>
            </div>
            {/* Badge */}
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: promo.color }}>
              {promo.badge}
            </p>
            {/* Title */}
            <h3 className="text-xl font-black text-[#1A1A1A] uppercase tracking-tighter mb-1 leading-tight">{promo.title}</h3>
            <p className="text-gray-400 text-[10px] font-bold mb-4 uppercase tracking-widest">{promo.subtitle}</p>
            {/* Desc */}
            <p className="text-gray-500 text-sm font-medium leading-relaxed flex-1 line-clamp-3">{promo.desc}</p>
            {/* Footer hint */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
              <p className="text-gray-400 text-[9px] font-bold uppercase tracking-widest">Expires: {promo.validUntil}</p>
              <p className="text-gray-400 text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 group-hover:text-[#1A1A1A] transition-colors">
                <span>Terms</span>
                <span className="text-base leading-none">→</span>
              </p>
            </div>
          </div>
        </div>

        {/* ── BACK ── */}
        <div style={{
          position:"absolute", inset:0, backfaceVisibility:"hidden", WebkitBackfaceVisibility:"hidden",
          transform:"rotateY(180deg)", borderRadius:"0.5rem", overflow:"hidden",
          background:`linear-gradient(145deg,${promo.color},#1A1A1A)`,
        }}>
          <div className="p-8 h-full flex flex-col justify-between text-white relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full blur-2xl"></div>
            <div className="relative z-10">
              <p className="text-[9px] font-bold uppercase tracking-[0.3em] mb-4 text-white/60">Terms & Conditions</p>
              <h3 className="text-xl font-black uppercase tracking-tighter mb-4 leading-tight">{promo.title}</h3>
              <p className="text-white/90 text-sm font-medium leading-relaxed">{promo.terms}</p>
            </div>
            <div className="flex flex-col gap-3 relative z-10">
              <Link href="/order"
                className="block text-center py-3 rounded-sm font-bold text-xs uppercase tracking-widest bg-white text-[#1A1A1A] hover:bg-gray-100 transition-colors duration-200 shadow-lg"
                onClick={e => e.stopPropagation()}>
                Order & Redeem →
              </Link>
              <button onClick={onFlip}
                className="text-center py-2 rounded-sm font-bold text-[10px] uppercase tracking-widest text-white/60 hover:text-white transition-colors duration-200">
                ← Flip Back
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}