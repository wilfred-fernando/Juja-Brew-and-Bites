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
      scrolled ? "bg-white/96 backdrop-blur-2xl shadow-[0_1px_30px_rgba(0,0,0,0.08)]" : "bg-transparent"
    }`}>
      <div className="max-w-7xl mx-auto px-6 lg:px-12 flex items-center justify-between h-20">
        <Link href="/" className="flex-shrink-0">
          {/* Note: Removed the white invert filter to match the new light theme */}
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
            Staff Login
          </Link>
          <Link href="/order"
            className="text-[11px] font-black uppercase tracking-widest px-7 py-3 rounded-full bg-[#FC687D] text-white hover:bg-rose-500 hover:shadow-[0_6px_20px_rgba(252,104,125,0.4)] hover:-translate-y-0.5 transition-all duration-300 shadow-md">
            Order Now →
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
            className="mt-2 py-3 rounded-full bg-[#FC687D] text-white font-black text-xs text-center uppercase tracking-widest hover:bg-rose-500 transition-colors">
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
                className="block text-neutral-600 hover:text-[#FC687D] transition-colors duration-200 text-sm tracking-wide">{l}</Link>
            ))}
          </div>
        </div>
        <div>
          <p className="text-white/50 font-bold mb-5 uppercase text-[10px] tracking-[0.3em]">Find Us</p>
          <div className="space-y-3.5 text-sm text-neutral-600">
            <p className="flex gap-3 items-start"><span className="text-[#FC687D] mt-0.5 flex-shrink-0">📍</span>36D Visayas Ave., Pasong Tamo, Quezon City</p>
            <p className="flex gap-3"><span className="text-[#FC687D] flex-shrink-0">📞</span>0939-9228383</p>
            <p className="flex gap-3"><span className="text-[#FC687D] flex-shrink-0">🕙</span>Store: 10AM – 12MN daily</p>
            <p className="flex gap-3"><span className="text-[#FC687D] flex-shrink-0">🏠</span>Function Room: 10AM – 2AM</p>
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
      className="bg-white rounded-3xl overflow-hidden border border-rose-50 flex flex-col group"
      style={{
        transition: "all 0.35s cubic-bezier(0.25,0.46,0.45,0.94)",
        transform: hov ? "translateY(-6px)" : "translateY(0)",
        boxShadow: hov ? "0 20px 40px rgba(252,104,125,0.12)" : "0 4px 15px rgba(0,0,0,0.03)",
      }}>
      {/* Image */}
      <div className="relative overflow-hidden flex-shrink-0 m-2 rounded-2xl" style={{ height: "160px" }}>
        {item.image_url
          ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover"
              style={{ transform: hov ? "scale(1.08)" : "scale(1)", transition: "transform 0.65s ease" }} />
          : <div className="w-full h-full flex items-center justify-center bg-rose-50"
              style={{ transition: "background 0.4s ease" }}>
              <span style={{ fontSize:"48px", transform: hov ? "scale(1.15)" : "scale(1)", transition:"transform 0.35s ease", display:"block" }}>
                {catIcon || "☕"}
              </span>
            </div>
        }
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"
          style={{ opacity: hov ? 1 : 0, transition: "opacity 0.35s ease" }} />

        {/* Badges */}
        <div className="absolute top-2.5 left-2.5 flex gap-1.5 z-10">
          {item.is_featured && (
            <span className="px-3 py-1 rounded-full text-white text-[9px] font-black uppercase tracking-widest bg-[#FC687D] shadow-md">
              ✦ Must Try
            </span>
          )}
          {item.is_available === false && (
            <span className="px-3 py-1 rounded-full text-white text-[9px] font-bold bg-slate-700/90 backdrop-blur-sm">
              Unavailable
            </span>
          )}
        </div>

        {/* Hover CTA */}
        <div className="absolute inset-x-0 bottom-0 flex justify-center pb-3 z-10"
          style={{ opacity: hov ? 1 : 0, transform: hov ? "translateY(0)" : "translateY(10px)", transition: "all 0.3s ease" }}>
          <Link href={`/menu/${item.id}`}
            className="px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest bg-white text-[#FC687D]
              hover:bg-[#FC687D] hover:text-white transition-colors duration-200 shadow-xl"
            onClick={e => e.stopPropagation()}>
            + Add to Order
          </Link>
        </div>
      </div>

      {/* Info */}
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-extrabold text-slate-800 text-[15px] leading-tight flex-1">{item.name}</h3>
          <span className="font-extrabold text-[#FC687D] text-[15px] flex-shrink-0">₱{item.price}</span>
        </div>
        {item.description && (
          <p className="text-slate-500 text-xs leading-relaxed line-clamp-2 mb-4 flex-1">{item.description}</p>
        )}
        {item.option_groups?.length > 0 && (
          <p className="text-[10px] text-slate-400 mb-3 flex items-center gap-1 font-bold uppercase tracking-widest">⚙ Customizable</p>
        )}
        <Link href={`/menu/${item.id}`}
          className="mt-auto block text-center py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300"
          style={{
            background: hov ? "#FC687D" : "#FFF5F7",
            color: hov ? "white" : "#FC687D",
            boxShadow: hov ? "0 5px 15px rgba(252,104,125,0.3)" : "none",
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
    <div className="min-h-screen bg-[#FFF5F7]" style={{ fontFamily:"'Inter',system-ui,sans-serif" }}>
      <Nav active="menu" />

      {/* ═══ SOFT HERO HEADER ═══ */}
      <div className="relative overflow-hidden bg-white" style={{ paddingTop:"6.5rem", paddingBottom:"4.5rem", borderBottom: "1px solid #ffe4e6" }}>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[180px] pointer-events-none"
          style={{ background:"radial-gradient(ellipse,rgba(252,104,125,0.15) 0%,transparent 70%)", filter:"blur(55px)" }} />
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage:"radial-gradient(rgba(252,104,125,0.8) 1px,transparent 1px)", backgroundSize:"26px 26px" }} />

        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
          <img src={LOGO} alt="Juja" className="h-20 md:h-24 w-auto object-contain mx-auto mb-6 drop-shadow-sm" />
          
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.25em] bg-rose-50 text-[#FC687D] border border-rose-100">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FC687D] animate-pulse" />
            Full Menu
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-800 tracking-tight mb-4">
            What Are You <span className="text-[#FC687D]">Craving?</span>
          </h1>
          <p className="text-slate-500 text-sm max-w-sm mx-auto font-medium">
            Pick a category and explore — freshly prepared with love every single day.
          </p>
        </div>
      </div>

      {/* ═══ STICKY CATEGORY TAB BAR ═══ */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md shadow-[0_4px_20px_rgba(252,104,125,0.05)] border-b border-rose-50">
        <div className="max-w-7xl mx-auto flex items-stretch">
          <button onClick={() => scroll(-1)}
            className="flex-shrink-0 w-12 flex items-center justify-center text-xl text-slate-400
              hover:text-[#FC687D] hover:bg-rose-50 transition-all duration-200 border-r border-rose-50">
            ‹
          </button>

          <div ref={tabsRef} className="flex flex-1 overflow-x-auto scroll-smooth py-2"
            style={{ scrollbarWidth:"none", msOverflowStyle:"none" }}>
            {loading
              ? <div className="flex gap-3 px-4 py-2">{[...Array(8)].map((_,i) => <div key={i} className="w-28 h-10 rounded-full bg-slate-100 animate-pulse flex-shrink-0" />)}</div>
              : categories.map(cat => {
                  const count = items.filter(i => i.category === cat.name).length;
                  const isActive = activeTab === cat.name;
                  return (
                    <button key={cat.id} onClick={() => setActiveTab(cat.name)}
                      className={`flex-shrink-0 flex items-center gap-2 px-5 py-2.5 mx-1 rounded-full
                        text-[11px] font-bold uppercase tracking-widest transition-all duration-300 whitespace-nowrap border
                        ${isActive
                          ? "bg-[#FC687D] text-white border-[#FC687D] shadow-md shadow-rose-200"
                          : "bg-white text-slate-500 border-slate-200 hover:border-[#FC687D] hover:text-[#FC687D]"
                        }`}>
                      <span className="text-base">{cat.icon}</span>
                      <span>{cat.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ml-1
                        ${isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"}`}>
                        {count}
                      </span>
                    </button>
                  );
                })
            }
          </div>

          <button onClick={() => scroll(1)}
            className="flex-shrink-0 w-12 flex items-center justify-center text-xl text-slate-400
              hover:text-[#FC687D] hover:bg-rose-50 transition-all duration-200 border-l border-rose-50">
            ›
          </button>
        </div>
      </div>

      {/* ═══ CATEGORY TITLE ROW ═══ */}
      {activeCat && !loading && (
        <div className="bg-[#FFF5F7] pt-10 pb-4">
          <div className="max-w-7xl mx-auto px-6 lg:px-10 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-3xl bg-white shadow-sm border border-rose-100">
                {activeCat.icon}
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">{activeCat.name}</h2>
                <p className="text-slate-500 text-[11px] mt-0.5 tracking-widest uppercase font-bold">
                  {filtered.length} item{filtered.length !== 1 ? "s" : ""} available
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ITEMS GRID ═══ */}
      <div className="max-w-7xl mx-auto px-6 lg:px-10 pb-24 pt-6">
        {loading ? (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_,i) => (
              <div key={i} className="bg-white rounded-3xl overflow-hidden border border-rose-50 animate-pulse p-2">
                <div className="h-40 bg-slate-100 rounded-2xl m-2" />
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-slate-100 rounded-full w-3/4" />
                  <div className="h-3 bg-slate-100 rounded-full w-full" />
                  <div className="h-3 bg-slate-100 rounded-full w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-32 bg-white rounded-3xl border border-dashed border-rose-200 mt-6">
            <div className="text-5xl mb-4 opacity-30">{activeCat?.icon || "🍽"}</div>
            <p className="font-bold text-slate-400">We're updating our menu. Check back soon!</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filtered.map((item, index) => (
              <div key={item.id} className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}>
                <MenuCard item={item} catIcon={activeCat?.icon} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ ORDER CTA ═══ */}
      {!loading && filtered.length > 0 && (
        <div className="py-20 px-6 text-center bg-white border-t border-rose-50">
          <p className="text-[#FC687D] text-[10px] font-black uppercase tracking-[0.3em] mb-4">Hungry?</p>
          <h3 className="text-3xl font-extrabold text-slate-800 mb-8">Ready to Place Your Order?</h3>
          <Link href="/order"
            className="inline-block px-12 py-4 rounded-full font-black text-sm uppercase tracking-widest text-white transition-all duration-300 hover:-translate-y-1 bg-[#FC687D] shadow-[0_10px_30px_rgba(252,104,125,0.3)]">
            Start Ordering →
          </Link>
        </div>
      )}

      <Footer />
    </div>
  );
}