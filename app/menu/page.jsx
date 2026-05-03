"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const catEmoji = { "Chicken":"🍗","Rice in a Box":"🍚","Rice Meal":"🍱","All Day Breakfast":"🍳","Coffee":"☕","Milk Tea":"🧋","Frappe":"🥤","Snacks":"🍟","Waffles":"🧇","Pasta":"🍝","Group Tray":"🫕", "Cookies":"🍪", "Signature":"✨", "Pastries":"🥐" };

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
          <img src={LOGO} alt="Juja"
            className="h-16 md:h-20 w-auto object-contain transition-all duration-300 hover:scale-105 drop-shadow" />
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {links.map(([id, label, href]) => (
            <Link key={id} href={href}
              className={`relative text-[12px] font-bold uppercase tracking-[0.18em] transition-all duration-300 group pb-1 ${
                active === id ? "text-[#1EBBA3]" : "text-neutral-600 hover:text-neutral-900"
              }`}>
              {label}
              <span className={`absolute bottom-0 left-0 h-[2px] rounded-full bg-gradient-to-r from-[#1EBBA3] to-[#159a85] transition-all duration-350 ${
                active === id ? "w-full" : "w-0 group-hover:w-full"
              }`} />
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/login"
            className="text-[11px] font-bold uppercase tracking-widest px-5 py-2.5 rounded-full
              border border-neutral-200 text-neutral-500
              hover:border-[#1EBBA3] hover:text-[#1EBBA3] hover:bg-[#1EBBA3]/10
              transition-all duration-300">
            Staff Login
          </Link>
          <Link href="/menu"
            className="text-[11px] font-black uppercase tracking-widest px-7 py-3 rounded-full
              bg-neutral-900 text-white
              hover:bg-[#1EBBA3] hover:shadow-[0_6px_28px_rgba(30,187,163,0.45)] hover:-translate-y-0.5
              transition-all duration-300 shadow-md">
            Order Now →
          </Link>
        </div>

        <button className="md:hidden p-2" onClick={() => setOpen(!open)}>
          <div className="w-5 space-y-[5px]">
            <span className={`block h-[2px] bg-neutral-800 rounded transition-all duration-300 ${open ? "rotate-45 translate-y-[7px]" : ""}`} />
            <span className={`block h-[2px] bg-neutral-800 rounded transition-all duration-300 ${open ? "opacity-0" : ""}`} />
            <span className={`block h-[2px] bg-neutral-800 rounded transition-all duration-300 ${open ? "-rotate-45 -translate-y-[7px]" : ""}`} />
          </div>
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-white/98 backdrop-blur-xl border-t border-neutral-100 shadow-2xl px-6 py-6 flex flex-col gap-4">
          {links.map(([, l, h]) => (
            <Link key={l} href={h} onClick={() => setOpen(false)}
              className="text-neutral-800 font-bold uppercase tracking-widest text-xs hover:text-[#1EBBA3] transition py-1">{l}</Link>
          ))}
          <Link href="/menu" onClick={() => setOpen(false)}
            className="mt-2 py-3 rounded-full bg-neutral-900 text-white font-black text-xs text-center uppercase tracking-widest hover:bg-[#1EBBA3] transition-colors">
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
            {[["Home","/"],["Menu","/menu"],["Promos","/promo"],["About Us","/about"],["Order Online","/menu"]].map(([l,h]) => (
              <Link key={l} href={h}
                className="block text-neutral-600 hover:text-[#1EBBA3] transition-colors duration-200 text-sm tracking-wide">{l}</Link>
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

// ─── Menu Card Component ──────────────────────────────────────────────────────
function MenuCard({ item, catIcon }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      className="bg-white rounded-2xl overflow-hidden border border-neutral-100 flex flex-col"
      style={{
        transition: "all 0.35s cubic-bezier(0.25,0.46,0.45,0.94)",
        transform: hov ? "translateY(-8px)" : "translateY(0)",
        boxShadow: hov ? "0 22px 55px rgba(0,0,0,0.12)" : "0 2px 8px rgba(0,0,0,0.04)",
      }}>
      {/* Image */}
      <div className="relative overflow-hidden flex-shrink-0" style={{ height: "170px" }}>
        {item.image_url
          ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover"
              style={{ transform: hov ? "scale(1.1)" : "scale(1)", transition: "transform 0.65s ease" }} />
          : <div className="w-full h-full flex items-center justify-center"
              style={{ background: hov ? "linear-gradient(135deg,#0a1a18,#102a24)" : "linear-gradient(135deg,#f0fdfa,#ccfbf1)", transition: "background 0.4s ease" }}>
              <span style={{ fontSize:"48px", transform: hov ? "scale(1.15)" : "scale(1)", transition:"transform 0.35s ease", display:"block" }}>
                {catIcon || "🍽"}
              </span>
            </div>
        }
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"
          style={{ opacity: hov ? 1 : 0, transition: "opacity 0.35s ease" }} />

        {/* Badges */}
        <div className="absolute top-2.5 left-2.5 flex gap-1.5 z-10">
          {item.is_featured && (
            <span className="px-2.5 py-0.5 rounded-full text-white text-[9px] font-black uppercase tracking-widest"
              style={{ background:"linear-gradient(135deg,#159a85,#1EBBA3)", boxShadow:"0 3px 10px rgba(30,187,163,0.5)" }}>
              ✦ Must Try
            </span>
          )}
          {item.status !== "available" && (
            <span className="px-2.5 py-0.5 rounded-full text-white text-[9px] font-bold bg-neutral-700/90">
              Unavailable
            </span>
          )}
        </div>

        {/* Hover CTA */}
        <div className="absolute inset-x-0 bottom-0 flex justify-center pb-3 z-10"
          style={{ opacity: hov ? 1 : 0, transform: hov ? "translateY(0)" : "translateY(10px)", transition: "all 0.3s ease" }}>
          <Link href={`/menu/${item.id}`} // Or wherever your order modal lives
            className="px-5 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest bg-white text-neutral-900
              hover:bg-[#1EBBA3] hover:text-white transition-colors duration-200 shadow-xl"
            onClick={e => e.stopPropagation()}>
            + Add to Order
          </Link>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="font-black text-neutral-900 text-sm leading-snug flex-1 uppercase tracking-tight">{item.name}</h3>
          <span className="font-black text-[#1EBBA3] text-sm flex-shrink-0">₱{item.price}</span>
        </div>
        {item.description && (
          <p className="text-neutral-400 text-[11px] leading-relaxed line-clamp-2 mb-3 flex-1">{item.description}</p>
        )}
        {item.option_groups?.length > 0 && (
          <p className="text-[10px] text-neutral-400 mb-2.5 flex items-center gap-1 font-bold uppercase tracking-widest">⚙ Customizable</p>
        )}
        <Link href={`/menu/${item.id}`} // Point this to your actual order flow later
          className="mt-auto block text-center py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300"
          style={{
            background: hov ? "linear-gradient(135deg,#159a85,#1EBBA3)" : "#f4f4f5",
            color: hov ? "white" : "#374151",
            boxShadow: hov ? "0 5px 18px rgba(30,187,163,0.3)" : "none",
          }}>
          Order Now →
        </Link>
      </div>
    </div>
  );
}

// ─── Menu Page ────────────────────────────────────────────────────────────────
export default function MenuPage() {
  const [items, setItems]         = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [loading, setLoading]     = useState(true);
  const tabsRef = useRef(null);

  useEffect(() => {
    async function loadMenu() {
      setLoading(true);
      const { data, error } = await supabase.from("menu_items").select("*");
      
      if (!error && data) {
        setItems(data);
        
        // Dynamically build categories from the existing items
        const uniqueCatNames = [...new Set(data.map(i => i.category))];
        const builtCategories = uniqueCatNames.map(name => ({
          id: name,
          name: name,
          icon: catEmoji[name] || "🍽"
        })).sort((a, b) => a.name.localeCompare(b.name));

        setCategories(builtCategories);
        if (builtCategories.length > 0) setActiveTab(builtCategories[0].name);
      }
      setLoading(false);
    }
    
    loadMenu();
  }, []);

  const activeCat = categories.find(c => c.name === activeTab);
  const filtered  = items.filter(i => i.category === activeTab);

  const scroll = (dir) => { if (tabsRef.current) tabsRef.current.scrollLeft += dir * 300; };

  return (
    <div className="min-h-screen" style={{ fontFamily:"'Inter',system-ui,sans-serif", background:"#f7f7f7" }}>
      <Nav active="menu" />

      {/* ═══ DARK HERO HEADER ═══ */}
      <div className="relative overflow-hidden" style={{ background:"linear-gradient(160deg,#0c0c0c 0%,#0a1a18 60%,#0c0c0c 100%)", paddingTop:"5.5rem", paddingBottom:"3.5rem" }}>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[180px] pointer-events-none"
          style={{ background:"radial-gradient(ellipse,rgba(30,187,163,0.18) 0%,transparent 70%)", filter:"blur(55px)" }} />
        <div className="absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage:"radial-gradient(rgba(255,255,255,0.6) 1px,transparent 1px)", backgroundSize:"26px 26px" }} />

        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <img src={LOGO} alt="Juja"
            className="h-28 md:h-36 w-auto object-contain mx-auto mb-5 brightness-0 invert drop-shadow-2xl" />
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.25em]"
            style={{ border:"1px solid rgba(30,187,163,0.25)", color:"#1EBBA3", background:"rgba(30,187,163,0.06)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#1EBBA3] animate-pulse" />
            Full Menu
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-3">
            What Are You <span style={{ color:"#1EBBA3" }}>Craving?</span>
          </h1>
          <p className="text-neutral-500 text-sm max-w-sm mx-auto">
            Pick a category and explore — freshly prepared with love every day.
          </p>
        </div>
      </div>

      {/* ═══ STICKY CATEGORY TAB BAR ═══ */}
      <div className="sticky top-0 z-40 bg-white shadow-[0_3px_20px_rgba(0,0,0,0.07)] border-b border-neutral-100">
        <div className="max-w-7xl mx-auto flex items-stretch">
          <button onClick={() => scroll(-1)}
            className="flex-shrink-0 w-10 flex items-center justify-center text-lg text-neutral-400
              hover:text-[#1EBBA3] hover:bg-[#1EBBA3]/10 transition-all duration-200 border-r border-neutral-100">
            ‹
          </button>

          <div ref={tabsRef} className="flex flex-1 overflow-x-auto scroll-smooth"
            style={{ scrollbarWidth:"none", msOverflowStyle:"none" }}>
            {loading
              ? <div className="flex gap-3 px-4 py-3">{[...Array(8)].map((_,i) => <div key={i} className="w-24 h-8 rounded-lg bg-neutral-100 animate-pulse flex-shrink-0" />)}</div>
              : categories.map(cat => {
                  const count = items.filter(i => i.category === cat.name).length;
                  const isActive = activeTab === cat.name;
                  return (
                    <button key={cat.id} onClick={() => setActiveTab(cat.name)}
                      className={`flex-shrink-0 flex flex-col items-center justify-center gap-0.5 px-5 py-3.5 min-w-[90px]
                        text-[10px] font-black uppercase tracking-widest border-b-[3px]
                        transition-all duration-250 whitespace-nowrap
                        ${isActive
                          ? "border-[#1EBBA3] text-[#1EBBA3] bg-[#1EBBA3]/10"
                          : "border-transparent text-neutral-400 hover:text-neutral-800 hover:bg-neutral-50"
                        }`}>
                      <span className="text-lg leading-none mb-0.5">{cat.icon}</span>
                      <span className="leading-none">{cat.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold mt-0.5
                        ${isActive ? "bg-[#1EBBA3]/20 text-[#159a85]" : "bg-neutral-100 text-neutral-400"}`}>
                        {count}
                      </span>
                    </button>
                  );
                })
            }
          </div>

          <button onClick={() => scroll(1)}
            className="flex-shrink-0 w-10 flex items-center justify-center text-lg text-neutral-400
              hover:text-[#1EBBA3] hover:bg-[#1EBBA3]/10 transition-all duration-200 border-l border-neutral-100">
            ›
          </button>
        </div>
      </div>

      {/* ═══ CATEGORY TITLE ROW ═══ */}
      {activeCat && !loading && (
        <div className="bg-white border-b border-neutral-100">
          <div className="max-w-7xl mx-auto px-6 lg:px-10 py-6 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl border border-neutral-100"
                style={{ background:"linear-gradient(135deg,#f0fdfa,#ccfbf1)", boxShadow:"0 2px 10px rgba(30,187,163,0.1)" }}>
                {activeCat.icon}
              </div>
              <div>
                <h2 className="text-2xl font-black text-neutral-900 tracking-tight uppercase">{activeCat.name}</h2>
                <p className="text-neutral-400 text-xs mt-0.5 tracking-widest uppercase font-bold">
                  {filtered.length} item{filtered.length !== 1 ? "s" : ""} available
                </p>
              </div>
            </div>
            {/* Note: In Next.js App Router, we keep this as a simple scroll or modal trigger. For now, it stays styled as a button */}
            <button
              className="flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest text-white transition-all duration-300 hover:-translate-y-0.5"
              style={{ background:"linear-gradient(135deg,#159a85,#1EBBA3)", boxShadow:"0 5px 20px rgba(30,187,163,0.35)" }}>
              🛒 View Cart
            </button>
          </div>
        </div>
      )}

      {/* ═══ ITEMS GRID ═══ */}
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10 pb-24">
        {loading ? (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {[...Array(8)].map((_,i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden border border-neutral-100 animate-pulse">
                <div className="h-44 bg-neutral-100" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-neutral-100 rounded w-3/4" />
                  <div className="h-3 bg-neutral-100 rounded w-full" />
                  <div className="h-3 bg-neutral-100 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-32">
            <div className="text-5xl mb-4 opacity-20">{activeCat?.icon || "🍽"}</div>
            <p className="font-bold text-neutral-400">No items in this category yet.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filtered.map(item => (
              <MenuCard key={item.id} item={item} catIcon={activeCat?.icon} />
            ))}
          </div>
        )}
      </div>

      {/* ═══ ORDER CTA ═══ */}
      {!loading && filtered.length > 0 && (
        <div className="py-16 px-6 text-center" style={{ background:"#0c0c0c" }}>
          <p className="text-[#1EBBA3] text-[10px] font-black uppercase tracking-[0.3em] mb-3">Hungry?</p>
          <h3 className="text-2xl font-black text-white mb-6 uppercase tracking-tighter">Ready to Place Your Order?</h3>
          {/* Note: Points back to top or opens cart */}
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="inline-block px-12 py-4 rounded-full font-black text-sm uppercase tracking-widest text-white transition-all duration-300 hover:-translate-y-1"
            style={{ background:"linear-gradient(135deg,#159a85,#1EBBA3)", boxShadow:"0 10px 35px rgba(30,187,163,0.4)" }}>
            Order Now →
          </button>
        </div>
      )}

      <Footer />
    </div>
  );
}