"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

// ─── Shared Nav (Compact Height Locked) ───────────────────────────────────────
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

// ─── Shared Footer (Compact Fixed Footprint) ──────────────────────────────────
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

// ─── Public Menu Page ─────────────────────────────────────────────────────────
export default function PublicMenuPage() {
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promo, setPromo] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

  const todayKey = useMemo(() => {
    const iso = new Date().toISOString().slice(0, 10);
    return `juja_promo_seen_${iso}`;
  }, []);

  useEffect(() => {
    const seen = typeof window !== "undefined" ? localStorage.getItem(todayKey) : "1";
    if (seen) return;

    (async () => {
      setPromoLoading(true);
      const { data, error } = await supabase
        .from("promo_codes")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setPromo(data);
        setPromoOpen(true);
      }
      setPromoLoading(false);
    })();
  }, [todayKey]);

  const closePromo = () => {
    try { localStorage.setItem(todayKey, "1"); } catch {}
    setPromoOpen(false);
  };

  useEffect(() => {
    if (promoOpen) return;

    (async () => {
      setLoading(true);
      const [itemRes, catRes] = await Promise.all([
        supabase
          .from("menu_items")
          .select("*")
          .eq("is_available", true)
          .or("pos_only.is.null,pos_only.eq.false")
          .order("name"),
        supabase
          .from("menu_categories")
          .select("*")
          .eq("is_active", true)
          .or("pos_only.is.null,pos_only.eq.false")
          .order("name", { ascending: true }),
      ]);

      const itemsData = itemRes?.data || [];
      const catsData  = catRes?.data || [];
      const allowedCatNames = new Set(catsData.map(c => c.name));
      const safeItems = itemsData.filter(i => allowedCatNames.has(i.category));

      setCats(catsData);
      setItems(safeItems);
      setLoading(false);
    })();
  }, [promoOpen]);

  const categoryList = useMemo(() => {
    const fromCats = (cats || []).map((c) => c?.name).filter(Boolean);
    const fallback = Array.from(new Set((items || []).map((i) => i.category || "Others")));
    return Array.from(new Set(fromCats.length ? fromCats : fallback));
  }, [cats, items]);

  useEffect(() => {
    if (!selectedCategory && categoryList.length > 0) {
      setSelectedCategory(categoryList[0]);
    }
  }, [categoryList, selectedCategory]);

  const q = search.trim().toLowerCase();

  const visibleItems = useMemo(() => {
    if (!items?.length) return [];
    if (q) return items.filter((i) => (i.name || "").toLowerCase().includes(q));
    const cat = selectedCategory || categoryList[0] || "";
    return items.filter((i) => (i.category || "Others") === cat);
  }, [items, q, selectedCategory, categoryList]);

  const metricKey = useMemo(() => {
    const candidates = ["times_ordered", "order_count", "orders_count", "total_orders"];
    for (const k of candidates) {
      if ((items || []).some((it) => typeof it?.[k] === "number")) return k;
    }
    return null;
  }, [items]);

  const mostOrderedIdSet = useMemo(() => {
    if (!metricKey) return new Set();
    const scored = (items || [])
      .map((it) => ({ id: it.id, v: Number(it?.[metricKey] || 0) }))
      .filter((x) => x.id && x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 8);
    return new Set(scored.map((x) => x.id));
  }, [items, metricKey]);

  return (
    // Outer Frame locked to screen viewport dimensions (h-screen w-screen overflow-hidden)
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#FFF5F7]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Nav active="menu" />
      
      {/* 1) PROMO POPUP CONDITIONAL */}
      {promoOpen && (
        <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6" onClick={closePromo}>
          <div className="w-full max-w-md bg-white rounded-t-[26px] md:rounded-[30px] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">Promo</p>
                <h3 className="text-xl font-bold text-slate-800 mt-1">🎁 Limited Offer</h3>
                <p className="text-sm text-slate-600 mt-2">
                  Use code <span className="font-mono font-bold text-[#FC687D]">{promo?.code || "PROMO"}</span> — {promo?.type === "percent" ? `${promo?.discount}% OFF` : `₱${promo?.discount} OFF`}.
                </p>
              </div>
              <button onClick={closePromo} className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500">✕</button>
            </div>
            <div className="mt-5">
              <button onClick={closePromo} className="w-full py-3 rounded-xl bg-[#FC687D] text-white text-xs font-bold uppercase tracking-widest">View Menu</button>
            </div>
          </div>
        </div>
      )}

      {/* 2) SELECTION MODAL LAYER */}
      {selectedItem && (
        <VariantModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}

      {/* 3) CENTRAL APPARATUS VIEWPORT (Absorbs available remaining space via flex-1) */}
      <div className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-6 py-4 flex flex-col min-h-0">
        
        {/* Header Block (Fixed Size Frame) */}
        <div className="mb-3 flex-none flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">Our Menu</h1>
            <p className="text-[11px] text-slate-400">Browse all available items</p>
          </div>
          
          {/* Optional inline live search box input can go here down the line */}
          <div className="w-1/3 max-w-xs">
            <input 
              type="text" 
              placeholder="Search item..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#FC687D]"
            />
          </div>
        </div>

        {/* Dropdown Options Row Block */}
        <div className="mb-3 flex-none">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            disabled={!!q}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
          >
            {categoryList.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        
        {/* 4) DYNAMICALLY SCROLLING INNER GRID SPACE */}
        {/* flex-1 + min-h-0 + overflow-y-auto traps scrolling mechanics purely within this grid wrapper */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
          {(loading || promoLoading) ? (
            <div className="flex justify-center items-center h-full">
              <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-slate-400 pt-10 text-xs">No items available</p>
          ) : (
            <>
              <div className="flex items-end justify-between mb-2">
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {q ? "Search results" : (selectedCategory || "Menu")}
                </h2>
                <p className="text-[11px] text-slate-400">{visibleItems.length} item(s)</p>
              </div>

              {visibleItems.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                  No items found.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3 pb-4">
                  {visibleItems.map((item) => {
                    const bestSeller = !!item.is_featured;
                    const mostOrdered = mostOrderedIdSet.has(item.id);

                    return (
                      <button
                        key={item.id}
                        onClick={() => setSelectedItem(item)}
                        className="relative text-left bg-white border border-slate-100 rounded-xl p-2 shadow-sm hover:shadow-md transition active:scale-[0.99] flex flex-col justify-between"
                      >
                        <div>
                          {/* Badges container */}
                          <div className="absolute top-1.5 left-1.5 flex flex-col gap-0.5 z-10">
                            {bestSeller && (
                              <span className="px-1.5 py-0.5 rounded bg-[#FC687D] text-white text-[8px] font-bold uppercase tracking-wider shadow-sm">
                                Best Seller
                              </span>
                            )}
                            {mostOrdered && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white text-[8px] font-bold uppercase tracking-wider shadow-sm">
                                Most Ordered
                              </span>
                            )}
                          </div>

                          {/* Product Image Frame */}
                          <div className="w-full aspect-square rounded-lg bg-[#FFF9FA] border border-rose-50 flex items-center justify-center overflow-hidden mb-1.5">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.name} className="w-full h-full object-cover object-center" />
                            ) : (
                              <span className="text-sm text-rose-200">📷</span>
                            )}
                          </div>

                          <p className="text-xs font-bold text-slate-800 leading-tight line-clamp-2">{item.name}</p>
                        </div>
                        
                        <div className="mt-1.5 flex items-center justify-between w-full">
                          <p className="text-xs text-[#FC687D] font-bold">₱{Number(item.price || 0).toFixed(0)}</p>
                          <span className="text-[9px] text-slate-400 uppercase tracking-tight bg-slate-50 px-1 py-0.5 rounded">Options</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
    Variant Selection Overlay Modal Box
────────────────────────────────────────────────────────────── */
function VariantModal({ item, onClose }) {
  const [selections, setSelections] = useState({});
  const variants = Array.isArray(item?.variants) ? item.variants : [];

  useEffect(() => {
    const defaults = {};
    variants.forEach((g) => {
      if (g?.isRequired && Array.isArray(g.options) && g.options.length > 0) {
        defaults[g.id] = [g.options[0]];
      }
    });
    setSelections(defaults);
  }, [item?.id]);

  const toggleOption = (group, opt) => {
    const current = selections[group.id] || [];
    if (!group.isMultiSelect) {
      setSelections({ ...selections, [group.id]: [opt] });
    } else {
      const exists = current.find((o) => o.id === opt.id);
      setSelections({
        ...selections,
        [group.id]: exists ? current.filter((o) => o.id !== opt.id) : [...current, opt],
      });
    }
  };

  const variantPrice = Object.values(selections).flat().reduce((sum, o) => sum + (Number(o.price) || 0), 0) || 0;
  const totalPrice = (Number(item.price) || 0) + variantPrice;
  const requiredOk = variants.every((g) => !g.isRequired || (selections[g.id] || []).length > 0);

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-t-[26px] md:rounded-[30px] p-5 shadow-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 flex-none">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Options</p>
            <h3 className="text-base font-bold text-slate-800 mt-0.5">{item.name}</h3>
            <p className="text-sm text-[#FC687D] font-bold mt-1">₱{Number(totalPrice).toFixed(0)}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 text-xs">✕</button>
        </div>

        {/* Scrollable interior variant lists container */}
        <div className="flex-1 overflow-y-auto my-3 pr-1 space-y-4 text-xs">
          {variants.length > 0 ? (
            variants.map((g) => (
              <div key={g.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-slate-700">{g.name} {g.isRequired && <span className="text-rose-500">*</span>}</p>
                  <p className="text-[9px] text-slate-400 uppercase">{g.isMultiSelect ? "Multi" : "Single"}</p>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(g.options || []).map((o) => {
                    const sel = (selections[g.id] || []).find((x) => x.id === o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => toggleOption(g, o)}
                        className={`p-2.5 rounded-xl border text-left transition-all ${sel ? "border-rose-300 bg-rose-50/40" : "border-slate-200 bg-white"}`}
                      >
                        <div className="font-semibold text-slate-800 leading-tight">{o.name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{Number(o.price) > 0 ? `+₱${Number(o.price).toFixed(0)}` : "Included"}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-500 text-center">No customization variants available.</div>
          )}
        </div>

        <button
          onClick={onClose}
          disabled={!requiredOk}
          className="w-full py-2.5 rounded-xl bg-[#FC687D] text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50 flex-none"
        >
          Confirm Options
        </button>
      </div>
    </div>
  );
}