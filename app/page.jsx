"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// Mock or import your supabase client instance here
// import { supabase } from "@/lib/supabase"; 
// Dummy fallback definition to avoid compilation crash if missing:
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

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link 
            href={loginUrl}
            className="text-[11px] font-semibold uppercase tracking-widest px-5 py-2.5 rounded-full border border-slate-200 text-slate-500 hover:border-[#FC687D] hover:text-[#FC687D] hover:bg-rose-50 transition-all duration-300"
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
        <div className="md:hidden bg-white/98 backdrop-blur-xl border-t border-slate-100 shadow-2xl px-6 py-6 flex flex-col gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          {links.map(([, l, h]) => (
            <Link key={l} href={h} onClick={() => setOpen(false)}
              className="text-slate-800 font-medium uppercase tracking-widest text-xs hover:text-[#FC687D] transition py-2 border-b border-slate-50">{l}</Link>
          ))}
          <Link href={loginUrl} onClick={() => setOpen(false)}
              className="text-slate-800 font-medium uppercase tracking-widest text-xs hover:text-[#FC687D] transition py-2 border-b border-slate-50">Login</Link>          
        </div>
      )}
    </nav>
  );
}

// ─── Shared Footer ────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 pt-20 pb-10 px-6">
      <div className="max-w-6xl mx-auto grid sm:grid-cols-2 md:grid-cols-3 gap-10 md:gap-14 mb-14">
        <div className="sm:col-span-2 md:col-span-1">
          <img src={LOGO} alt="Juja" className="h-14 w-auto object-contain mb-5 brightness-0 invert opacity-60" />
          <p className="text-slate-400 text-sm leading-relaxed max-w-sm">Your premier destination for specialty brews and artisan bites in the heart of Quezon City.</p>
        </div>
        <div>
          <p className="text-white/60 font-semibold mb-5 uppercase text-[10px] tracking-[0.3em]">Explore</p>
          <div className="space-y-3">
            {[["Home","/"],["Menu","/menu"],["Promos","/promos"],["About Us","/about"],["Order Online","/order"]].map(([l,h]) => (
              <Link key={l} href={h}
                className="block text-slate-400 hover:text-[#FC687D] transition-colors duration-200 text-sm tracking-wide">{l}</Link>
            ))}
          </div>
        </div>
        <div>
          <p className="text-white/60 font-semibold mb-5 uppercase text-[10px] tracking-[0.3em]">Find Us</p>
          <div className="space-y-3.5 text-sm text-slate-400">
            <p className="flex gap-3 items-start"><span className="text-[#FC687D] mt-0.5 flex-shrink-0">📍</span>36D Visayas Ave., Pasong Tamo, Quezon City</p>
            <p className="flex gap-3"><span className="text-[#FC687D] flex-shrink-0">📞</span>0939-9228383</p>
            <p className="flex gap-3"><span className="text-[#FC687D] flex-shrink-0">🕙</span>Store: 10AM – 12MN daily</p>
            <p className="flex gap-3"><span className="text-[#FC687D] flex-shrink-0">🏠</span>Function Room: 10AM – 2AM</p>
          </div>
        </div>
      </div>
      <div className="max-w-6xl mx-auto pt-8 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4 text-center sm:text-left">
        <p className="text-slate-500 text-[11px] tracking-[0.2em] uppercase">© {new Date().getFullYear()} Juja Brew & Bites® · All rights reserved</p>
        <p className="text-slate-500 text-[11px] tracking-wider uppercase">Quezon City · Philippines</p>
      </div>
    </footer>
  );
}

// ─── Home Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [featured, setFeatured] = useState([]);
  const [categories, setCategories] = useState([]);
  const [allItems, setAllItems] = useState([]);

  const catEmoji = { 
    "Chicken":"🍗","Rice in a Box":"🍚","Rice Meal":"🍱","All Day Breakfast":"🍳","Coffee":"☕",
    "Milk Tea":"🧋","Frappe":"🥤","Snacks":"🍟","Waffles":"🧇","Pasta":"🍝","Group Tray":"🫕", 
    "Cookies":"🍪", "Signature":"✨" 
  };

  useEffect(() => {
    async function loadData() {
      try {
        const { data: featData } = await supabase.from("menu_items").select("*").eq("is_featured", true).limit(6);
        if (featData) setFeatured(featData);

        const { data: allData } = await supabase.from("menu_items").select("*");
        if (allData) {
          setAllItems(allData);
          const uniqueCats = [...new Set(allData.map(item => item.category))];
          const mappedCats = uniqueCats.map(name => ({
            name,
            icon: catEmoji[name] || "🍽"
          }));
          setCategories(mappedCats);
        }
      } catch (error) {
        console.error("Data loading failed:", error);
      }
    }
    loadData();
  }, []);

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Nav active="home" />

      {/* ═══ HERO ═══ */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-b from-[#FFF5F7] to-white pt-20">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/10 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] rounded-full opacity-20"
            style={{ background: "radial-gradient(circle,#FC687D 0%,transparent 65%)", filter: "blur(80px)" }} />
          <div className="absolute bottom-1/4 right-1/10 w-[250px] sm:w-[400px] h-[250px] sm:h-[400px] rounded-full opacity-15"
            style={{ background: "radial-gradient(circle,#fda4af 0%,transparent 65%)", filter: "blur(80px)" }} />
        </div>

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto py-12 flex flex-col items-center">
          <img src={LOGO} alt="Juja Brew & Bites"
            className="h-28 sm:h-36 md:h-44 w-auto object-contain mx-auto mb-6 sm:mb-8 drop-shadow-md" />
            
          <p className="text-slate-500 text-sm sm:text-base md:text-xl max-w-xl mx-auto font-medium tracking-wide leading-relaxed mb-4">
            Chicken · Milk Tea · Coffee · Waffle · Rice in a Box
          </p>

          <div className="inline-flex items-center gap-2 mb-8 px-5 py-2 rounded-full text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.25em] bg-white text-[#FC687D] border border-rose-100 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FC687D] animate-pulse" />
            food · drinks · Quezon City
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-[76px] font-black leading-[1.1] md:leading-[1.05] tracking-tight mb-8 text-slate-800 uppercase">
            brewing with<br />
            <span className="text-[#FC687D] relative">
              gratitude
            </span>
          </h1>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto px-4">
            <Link href="/order"
              className="w-full sm:w-auto px-10 py-4 rounded-full font-semibold text-xs sm:text-sm text-center uppercase tracking-widest text-white transition-all duration-300 bg-[#FC687D] shadow-[0_10px_25px_rgba(252,104,125,0.3)] hover:bg-rose-500 hover:-translate-y-0.5">
              Order Online →
            </Link>
            <Link href="/menu"
              className="w-full sm:w-auto px-10 py-4 rounded-full font-semibold text-xs sm:text-sm text-center uppercase tracking-widest bg-white text-slate-700 border border-slate-200 hover:border-[#FC687D] hover:text-[#FC687D] hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
              View Full Menu
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ CATEGORY GRID ═══ */}
      <section className="py-20 sm:py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <p className="text-[#FC687D] uppercase tracking-[0.3em] text-[10px] font-semibold mb-2">What We Serve</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-800 tracking-tight uppercase">Our Categories</h2>
            <div className="w-12 h-[3px] rounded-full bg-[#FC687D] mx-auto mt-4" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">  
            {categories.length > 0 ? (
              categories.map(cat => {
                const count = allItems.filter(i => i.category === cat.name).length;
                return (
                  <Link key={cat.name} href="/menu"
                    className="group relative p-6 sm:p-8 rounded-3xl bg-[#FFF5F7] border border-rose-50 text-center overflow-hidden hover:bg-[#FC687D] hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 flex flex-col justify-center items-center aspect-square sm:aspect-auto sm:min-h-[170px]">
                    <div className="text-4xl sm:text-5xl mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">{cat.icon}</div>
                    <p className="font-bold text-slate-800 text-xs sm:text-sm group-hover:text-white transition-colors duration-300 tracking-wide px-1 leading-tight uppercase">
                      {cat.name}
                    </p>
                    <p className="text-slate-400 text-[10px] sm:text-[11px] mt-1 font-medium group-hover:text-rose-100 transition-colors uppercase">{count} items</p>
                  </Link>
                );
              })
            ) : (
              <div className="col-span-full text-center text-slate-400 py-10 font-medium">Loading categories...</div>
            )}
          </div>

          <div className="text-center mt-12">
            <Link href="/menu"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-slate-50 text-slate-700 font-semibold text-xs uppercase tracking-widest hover:bg-[#FC687D] hover:text-white hover:shadow-md transition-all duration-300">
              View Full Menu →
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ FEATURED ITEMS ═══ */}
      {featured.length > 0 && (
        <section className="py-20 sm:py-24 px-4 sm:px-6 bg-[#FFF5F7]">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12 sm:mb-16">
              <p className="text-[#FC687D] uppercase tracking-[0.3em] text-[10px] font-semibold mb-2">Staff Picks</p>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-800 tracking-tight uppercase">Must-Try Items</h2>
              <div className="w-12 h-[3px] rounded-full bg-[#FC687D] mx-auto mt-4" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {featured.map(item => (
                <FeaturedCard key={item.id} item={item} catEmoji={catEmoji} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ HOURS BANNER ═══ */}
      <section className="py-20 sm:py-24 px-4 sm:px-6 relative overflow-hidden bg-white border-t border-rose-50">
        <div className="relative max-w-4xl mx-auto text-center mb-12">
          <p className="text-[#FC687D] uppercase tracking-[0.3em] text-[10px] font-semibold mb-2">Visit Us</p>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-800 tracking-tight uppercase">Come Experience Juja</h2>
          <div className="w-12 h-[3px] rounded-full bg-[#FC687D] mx-auto mt-4" />
        </div>
        
        <div className="relative max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-12">
          {[
            { icon: "🏪", label: "Store Hours", val: "10AM – 12:00 MN" },
            { icon: "🏠", label: "Function Room", val: "10AM – 2:00 AM" },
            { icon: "📍", label: "Location", val: "Pasong Tamo, QC" },
          ].map(h => (
            <div key={h.label} className="text-center p-6 sm:p-8 rounded-3xl bg-[#FFF5F7] border border-rose-50 hover:shadow-sm transition-all duration-300">
              <div className="text-3xl sm:text-4xl mb-3">{h.icon}</div>
              <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-[0.15em] mb-1.5">{h.label}</p>
              <p className="text-slate-800 font-extrabold text-sm sm:text-base">{h.val}</p>
            </div>
          ))}
        </div>
        
        <div className="relative flex flex-col sm:flex-row gap-3 justify-center w-full sm:w-auto px-4 max-w-md mx-auto sm:max-w-none">
          <Link href="/order"
            className="px-10 py-4 rounded-full font-semibold text-xs sm:text-sm text-center uppercase tracking-widest text-white transition-all duration-300 hover:-translate-y-0.5 bg-[#FC687D] shadow-[0_10px_25px_rgba(252,104,125,0.3)]">
            Order Online Now →
          </Link>
          <Link href="/promos"
            className="px-10 py-4 rounded-full font-semibold text-xs sm:text-sm text-center uppercase tracking-widest transition-all duration-300 hover:-translate-y-0.5 bg-white text-slate-700 border border-slate-200 hover:border-[#FC687D] hover:text-[#FC687D]">
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
      onMouseEnter={() => setHovered(true)} 
      onMouseLeave={() => setHovered(false)}
      className="group bg-white rounded-3xl overflow-hidden border border-rose-50 flex flex-col w-full transition-all duration-300"
      style={{ 
        transform: hovered ? "translateY(-6px)" : "translateY(0)",
        boxShadow: hovered ? "0 20px 40px rgba(252,104,125,0.1)" : "0 4px 20px rgba(0,0,0,0.02)" 
      }}>
      
      <div className="relative overflow-hidden m-2.5 rounded-2xl flex-shrink-0 aspect-square bg-slate-50">
        {item.image_url ? (
          <img 
            src={item.image_url} 
            alt={item.name} 
            className="w-full h-full object-cover object-center transition-transform duration-700 ease-out"
            style={{ transform: hovered ? "scale(1.06)" : "scale(1)" }} 
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl sm:text-6xl bg-rose-50/50">
            <span className="transition-transform duration-300" style={{ transform: hovered ? "scale(1.1)" : "scale(1)" }}>
              {catEmoji[item.category] || "🍽"}
            </span>
          </div>
        )}
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        {item.is_featured && (
          <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full text-[9px] font-semibold uppercase tracking-widest text-white bg-[#FC687D] shadow-sm">
            ✦ Must Try
          </div>
        )}
        
        <div className="absolute bottom-4 inset-x-0 flex justify-center px-4 transition-all duration-300"
          style={{ 
            opacity: hovered ? 1 : 0, 
            transform: hovered ? "translateY(0)" : "translateY(10px)" 
          }}>
          <Link href="/order"
            className="w-full sm:w-auto px-5 py-2.5 rounded-full text-center text-xs font-semibold uppercase tracking-widest bg-white text-[#FC687D] hover:bg-[#FC687D] hover:text-white transition-colors duration-200 shadow-lg"
            onClick={e => e.stopPropagation()}>
            + Add to Order
          </Link>
        </div>
      </div>
      
      <div className="p-5 sm:p-6 flex flex-col flex-1 justify-between">
        <div className="flex justify-between items-start gap-3 mb-1.5">
          <h3 className="font-extrabold text-slate-800 text-sm sm:text-base leading-snug uppercase">{item.name}</h3>
          <span className="font-bold text-[#FC687D] text-base sm:text-lg flex-shrink-0">₱{item.price}</span>
        </div>
        {item.description && (
          <p className="text-slate-400 text-xs font-medium leading-relaxed line-clamp-2 mt-1">{item.description}</p>
        )}
      </div>
    </div>
  );
}