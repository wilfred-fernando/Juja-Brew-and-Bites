"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Shared Nav ───────────────────────────────────────────────────────────────
export function Nav({ active }) {
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
export function Footer() {
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

// ─── Home Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [featured, setFeatured] = useState([]);
  const [categories, setCategories] = useState([]);
  const [allItems, setAllItems] = useState([]);

  const catEmoji = { "Chicken":"🍗","Rice in a Box":"🍚","Rice Meal":"🍱","All Day Breakfast":"🍳","Coffee":"☕","Milk Tea":"🧋","Frappe":"🥤","Snacks":"🍟","Waffles":"🧇","Pasta":"🍝","Group Tray":"🫕", "Cookies":"🍪", "Signature":"✨" };

  useEffect(() => {
    async function loadData() {
      // 1. Fetch Featured Items
      const { data: featData } = await supabase.from("menu_items").select("*").eq("is_featured", true).limit(6);
      if (featData) setFeatured(featData);

      // 2. Fetch All Items
      const { data: allData } = await supabase.from("menu_items").select("*");
      if (allData) {
        setAllItems(allData);
        // Extract unique categories dynamically based on actual database items
        const uniqueCats = [...new Set(allData.map(item => item.category))];
        const mappedCats = uniqueCats.map(name => ({
          name,
          icon: catEmoji[name] || "🍽"
        }));
        setCategories(mappedCats);
      }
    }
    loadData();
  }, []);

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily:"'Inter',system-ui,sans-serif" }}>
      <Nav active="home" />

      {/* ═══ HERO ═══ */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-neutral-50"
        style={{ background:"linear-gradient(155deg,#f0fdfa 0%,#e6fffa 40%,#f0fdfa 80%,#ffffff 100%)" }}>
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/3 left-1/5 w-[500px] h-[500px] rounded-full opacity-15"
            style={{ background:"radial-gradient(circle,#1EBBA3 0%,transparent 65%)", filter:"blur(90px)" }} />
          <div className="absolute bottom-1/4 right-1/5 w-[400px] h-[400px] rounded-full opacity-10"
            style={{ background:"radial-gradient(circle,#159a85 0%,transparent 65%)", filter:"blur(90px)" }} />
        </div>

        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto pt-24 pb-16">
          <img src={LOGO} alt="Juja Brew & Bites"
            className="h-44 md:h-60 w-auto object-contain mx-auto mb-8 drop-shadow-2xl" />

          <div className="inline-flex items-center gap-2.5 mb-7 px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.3em]"
            style={{ background:"rgba(30,187,163,0.07)", border:"1px solid rgba(30,187,163,0.18)", color:"#159a85" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#1EBBA3] animate-pulse" />
            Brew & Bites · Quezon City · Open Daily
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-[80px] font-black leading-[1.0] tracking-[-0.02em] mb-5 text-neutral-900">
            Good Food.<br />
            <span className="bg-clip-text text-transparent" style={{ backgroundImage:"linear-gradient(130deg,#159a85 0%,#1EBBA3 40%,#34d399 100%)" }}>
              Great Brews.
            </span>
          </h1>
          <p className="text-neutral-500 text-lg md:text-xl max-w-xl mx-auto leading-relaxed mb-3">
            Chicken · Milk Tea · Coffee · Waffles · and so much more
          </p>
          <p className="text-[#159a85] text-sm font-medium mb-12 tracking-wide">
            📍 36D Visayas Ave., Pasong Tamo, QC &nbsp;·&nbsp; Open 10AM – 12MN
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/menu"
              className="relative overflow-hidden px-10 py-4 rounded-full font-black text-sm uppercase tracking-widest text-white
                hover:-translate-y-1 transition-all duration-300 group"
              style={{ background:"linear-gradient(135deg,#159a85,#1EBBA3)", boxShadow:"0 12px 40px rgba(30,187,163,0.45)" }}>
              <span className="relative z-10">Order Online →</span>
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </Link>
            <Link href="/menu"
              className="px-10 py-4 rounded-full font-bold text-sm uppercase tracking-widest bg-white
                text-neutral-700 border border-neutral-200
                hover:border-neutral-800 hover:bg-neutral-900 hover:text-white hover:shadow-xl hover:-translate-y-1
                transition-all duration-300">
              View Full Menu
            </Link>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-40">
          <div className="w-px h-14 bg-gradient-to-b from-transparent to-neutral-400 animate-pulse" />
          <span className="text-[9px] tracking-[0.4em] uppercase text-neutral-500">Scroll</span>
        </div>
      </section>

      {/* ═══ STATS BAR ═══ */}
      <div style={{ background:"#0c0c0c" }} className="py-5 px-6">
        <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-x-12 gap-y-3">
          {[
            [allItems.length > 0 ? `${allItems.length}+` : "170+", "Menu Items"],
            [categories.length > 0 ? `${categories.length}` : "11", "Categories"],
            ["10AM–12MN", "Store Hours"],
            ["Function Room", "Available for Events"],
          ].map(([n, l]) => (
            <div key={l} className="text-center">
              <p className="text-white font-black text-lg md:text-xl">{n}</p>
              <p className="text-neutral-600 text-[10px] uppercase tracking-widest mt-0.5">{l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ CATEGORY GRID ═══ */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[#1EBBA3] uppercase tracking-[0.3em] text-[10px] font-black mb-3">What We Serve</p>
            <h2 className="text-4xl md:text-5xl font-black text-neutral-900 tracking-tight">Our Menu</h2>
            <div className="w-12 h-[2px] rounded-full bg-gradient-to-r from-[#1EBBA3] to-[#159a85] mx-auto mt-4" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {categories.length > 0
              ? categories.map(cat => {
                  const count = allItems.filter(i => i.category === cat.name).length;
                  return (
                    <Link key={cat.name} href="/menu"
                      className="group relative p-6 rounded-2xl bg-neutral-50 border border-neutral-100 text-center overflow-hidden
                        hover:bg-neutral-900 hover:border-neutral-900 hover:shadow-2xl hover:-translate-y-2
                        transition-all duration-400">
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400"
                        style={{ background:"radial-gradient(circle at 50% 120%,rgba(30,187,163,0.15),transparent 70%)" }} />
                      <div className="text-4xl mb-3 group-hover:scale-125 transition-transform duration-300">{cat.icon}</div>
                      <p className="font-bold text-neutral-800 text-sm group-hover:text-white transition-colors duration-300 tracking-wide">{cat.name}</p>
                      <p className="text-neutral-400 text-[11px] mt-1 group-hover:text-neutral-500 transition-colors">{count} items</p>
                    </Link>
                  );
                })
              : [
                  {icon:"🍗",name:"Chicken"},{icon:"🧋",name:"Milk Tea"},{icon:"☕",name:"Coffee"},
                  {icon:"🧇",name:"Waffles"},{icon:"🍝",name:"Pasta"},{icon:"🍱",name:"Rice Meals"},
                  {icon:"🍳",name:"Breakfast"},{icon:"🫕",name:"Group Trays"},
                ].map(c => (
                  <Link key={c.name} href="/menu"
                    className="group p-6 rounded-2xl bg-neutral-50 border border-neutral-100 text-center
                      hover:bg-neutral-900 hover:border-neutral-900 hover:shadow-2xl hover:-translate-y-2 transition-all duration-400">
                    <div className="text-4xl mb-3 group-hover:scale-125 transition-transform duration-300">{c.icon}</div>
                    <p className="font-bold text-neutral-800 text-sm group-hover:text-white transition-colors duration-300">{c.name}</p>
                  </Link>
                ))}
          </div>
          <div className="text-center mt-10">
            <Link href="/menu"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full border-2 border-neutral-900 text-neutral-900 font-bold text-xs uppercase tracking-widest
                hover:bg-neutral-900 hover:text-white hover:shadow-xl transition-all duration-300">
              View Full Menu →
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ FEATURED ITEMS ═══ */}
      {featured.length > 0 && (
        <section className="py-24 px-6" style={{ background:"#f8faf9" }}>
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-[#1EBBA3] uppercase tracking-[0.3em] text-[10px] font-black mb-3">Staff Picks</p>
              <h2 className="text-4xl md:text-5xl font-black text-neutral-900 tracking-tight">Must-Try Items</h2>
              <div className="w-12 h-[2px] rounded-full bg-gradient-to-r from-[#1EBBA3] to-[#159a85] mx-auto mt-4" />
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featured.map(item => (
                <FeaturedCard key={item.id} item={item} catEmoji={catEmoji} />
              ))}
            </div>
            <div className="text-center mt-12">
              <Link href="/menu"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full border-2 border-neutral-900 text-neutral-900 font-bold text-xs uppercase tracking-widest
                  hover:bg-neutral-900 hover:text-white hover:shadow-xl transition-all duration-300">
                Explore Full Menu →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ═══ HOURS BANNER ═══ */}
      <section className="py-24 px-6 relative overflow-hidden" style={{ background:"#0c0c0c" }}>
        <div className="absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage:"radial-gradient(rgba(255,255,255,0.8) 1px,transparent 1px)", backgroundSize:"30px 30px" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[200px] opacity-[0.12] pointer-events-none"
          style={{ background:"radial-gradient(ellipse,#1EBBA3,transparent 70%)", filter:"blur(50px)" }} />
        
        <div className="relative max-w-4xl mx-auto text-center mb-14">
          <p className="text-[#1EBBA3] uppercase tracking-[0.3em] text-[10px] font-black mb-3">Visit Us</p>
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight">Come Experience Juja</h2>
          <div className="w-12 h-[2px] rounded-full bg-gradient-to-r from-[#1EBBA3] to-[#159a85] mx-auto mt-5" />
        </div>
        
        <div className="relative max-w-3xl mx-auto grid sm:grid-cols-3 gap-4 mb-14">
          {[
            { icon:"🏪", label:"Store Hours", val:"10AM – 12:00 MN" },
            { icon:"🏠", label:"Function Room", val:"10AM – 2:00 AM" },
            { icon:"📍", label:"Location", val:"Pasong Tamo, QC" },
          ].map(h => (
            <div key={h.label}
              className="text-center p-7 rounded-2xl border border-white/6 hover:border-[#1EBBA3]/40 transition-all duration-300"
              style={{ background:"rgba(255,255,255,0.04)" }}>
              <div className="text-3xl mb-3">{h.icon}</div>
              <p className="text-neutral-500 text-[10px] uppercase tracking-[0.2em] mb-2">{h.label}</p>
              <p className="text-white font-bold text-sm">{h.val}</p>
            </div>
          ))}
        </div>
        
        <div className="relative flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/menu"
            className="px-12 py-4 rounded-full font-black text-sm uppercase tracking-widest text-white transition-all duration-300 hover:-translate-y-1"
            style={{ background:"linear-gradient(135deg,#159a85,#1EBBA3)", boxShadow:"0 10px 40px rgba(30,187,163,0.3)" }}>
            Order Online Now →
          </Link>
          <Link href="/promo"
            className="px-12 py-4 rounded-full font-bold text-sm uppercase tracking-widest transition-all duration-300 hover:-translate-y-1"
            style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.7)" }}>
            View Promos 🎁
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}

// ─── Featured Item Card Component ──────────────────────────────────────────────
function FeaturedCard({ item, catEmoji }) {
  const [hovered, setHovered] = useState(false);
  
  return (
    <div
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      className="group bg-white rounded-3xl overflow-hidden border border-neutral-100"
      style={{ transition:"all 0.4s cubic-bezier(0.25,0.46,0.45,0.94)",
        transform: hovered ? "translateY(-10px)" : "translateY(0)",
        boxShadow: hovered ? "0 28px 60px rgba(0,0,0,0.14)" : "0 2px 10px rgba(0,0,0,0.05)" }}>
      
      <div className="relative overflow-hidden" style={{ height:"210px" }}>
        {item.image_url
          ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover"
              style={{ transform: hovered ? "scale(1.08)" : "scale(1)", transition:"transform 0.7s cubic-bezier(0.25,0.46,0.45,0.94)" }} />
          : <div className="w-full h-full flex items-center justify-center text-6xl"
              style={{ background: hovered ? "linear-gradient(135deg,#0a1a18,#102a24)" : "linear-gradient(135deg,#f0fdfa,#ccfbf1)",
                transition:"background 0.5s ease" }}>
              <span style={{ transform: hovered ? "scale(1.2)" : "scale(1)", transition:"transform 0.4s ease", display:"block" }}>
                {catEmoji[item.category] || "🍽"}
              </span>
            </div>
        }
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent"
          style={{ opacity: hovered ? 1 : 0, transition:"opacity 0.4s ease" }} />
        
        {item.is_featured && (
          <div className="absolute top-3 left-3 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white"
            style={{ background:"linear-gradient(135deg,#159a85,#1EBBA3)", boxShadow:"0 4px 14px rgba(30,187,163,0.4)" }}>
            ✦ Must Try
          </div>
        )}
        
        <div className="absolute bottom-4 inset-x-0 flex justify-center"
          style={{ opacity: hovered ? 1 : 0, transform: hovered ? "translateY(0)" : "translateY(14px)", transition:"all 0.35s ease" }}>
          <Link href="/menu"
            className="px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest bg-white text-neutral-900
              hover:bg-[#1EBBA3] hover:text-white transition-colors duration-200 shadow-xl"
            onClick={e => e.stopPropagation()}>
            + Order This
          </Link>
        </div>
      </div>
      
      <div className="p-6">
        <div className="flex justify-between items-start gap-2 mb-2">
          <h3 className="font-black text-neutral-900 text-base leading-tight flex-1">{item.name}</h3>
          <span className="font-black text-[#1EBBA3] text-lg flex-shrink-0">₱{item.price}</span>
        </div>
        {item.description && (
          <p className="text-neutral-400 text-xs leading-relaxed line-clamp-2">{item.description}</p>
        )}
      </div>
    </div>
  );
}