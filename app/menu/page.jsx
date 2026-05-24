"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

/**
 * Public Menu Page
 * ✅ Category dropdown (filter mode)
 * ✅ Search searches ALL items (ignores category while typing)
 * ✅ Shows item description
 * ✅ Promo popup BEFORE menu loads (once per day)
 * ✅ Best Seller badge (uses is_featured)
 * ✅ Most Ordered badge (only if an order metric field exists; marks top items)
 * ✅ Variant selection modal (2-column options)
 * ❌ No quantity / notes / reset
 */

export default function PublicMenuPage() {
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  
  // Promo popup
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promo, setPromo] = useState(null);

  // Variant modal
  const [selectedItem, setSelectedItem] = useState(null);

  const todayKey = useMemo(() => {
    const iso = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `juja_promo_seen_${iso}`;
  }, []);

  // 1) Promo popup first (once per day), before loading menu
  useEffect(() => {
    const seen = typeof window !== "undefined" ? localStorage.getItem(todayKey) : "1";
    if (seen) return;

    (async () => {
      setPromoLoading(true);

      // promo_codes table used in your admin promos page: code/discount/type/min_order/active [1](https://onedrive.live.com/?id=d547be6a-0d1c-4337-b252-2217378a6677&cid=933e55cc8541ec41&web=1)
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
      } else {
        setPromo(null);
        setPromoOpen(false);
      }

      setPromoLoading(false);
    })();
  }, [todayKey]);

  const closePromo = () => {
    try {
      localStorage.setItem(todayKey, "1");
    } catch {}
    setPromoOpen(false);
  };

  // 2) Fetch menu ONLY after promo closes (or promo not shown)
  useEffect(() => {
    if (promoOpen) return;

    (async () => {
      setLoading(true);

      const [itemRes, catRes] = await Promise.all([
        supabase
          .from("menu_items")
          .select("*")
          .eq("is_available", true)
          .or("pos_only.is.null,pos_only.eq.false")  // ✅ null-safe
          .order("name"),

        supabase
          .from("menu_categories")
          .select("*")
          .eq("is_active", true)
          .or("pos_only.is.null,pos_only.eq.false")  // ✅ null-safe
          .order("name", { ascending: true }),
      ]);

      const itemsData = itemRes?.data || [];
      const catsData  = catRes?.data || [];

      // ✅ Only allow items from visible categories
      const allowedCatNames = new Set(catsData.map(c => c.name));
      const safeItems = itemsData.filter(i => allowedCatNames.has(i.category));

      // ✅ Apply filtered results
      setCats(catsData);
      setItems(safeItems);

      setLoading(false);
    })();
  }, [promoOpen]);

  // 3) Categories list: prefer menu_categories, fallback to items
  const categoryList = useMemo(() => {
    const fromCats = (cats || []).map((c) => c?.name).filter(Boolean);
    const fallback = Array.from(new Set((items || []).map((i) => i.category || "Others")));
    const list = fromCats.length ? fromCats : fallback;
    return Array.from(new Set(list));
  }, [cats, items]);

  // default category
  useEffect(() => {
    if (!selectedCategory && categoryList.length > 0) {
      setSelectedCategory(categoryList[0]);
    }
  }, [categoryList, selectedCategory]);

  // 4) Search across ALL items
  const q = search.trim().toLowerCase();

  const visibleItems = useMemo(() => {
    if (!items?.length) return [];
    if (q) {
      return items.filter((i) => (i.name || "").toLowerCase().includes(q));
    }
    const cat = selectedCategory || categoryList[0] || "";
    return items.filter((i) => (i.category || "Others") === cat);
  }, [items, q, selectedCategory, categoryList]);

  // 5) Most Ordered badge (only if dataset has an order metric)
  const metricKey = useMemo(() => {
    const candidates = ["times_ordered", "order_count", "orders_count", "total_orders"];
    for (const k of candidates) {
      if ((items || []).some((it) => typeof it?.[k] === "number")) return k;
      if ((items || []).some((it) => !isNaN(Number(it?.[k])) && it?.[k] !== null && it?.[k] !== undefined))
        return k;
    }
    return null;
  }, [items]);

  const mostOrderedIdSet = useMemo(() => {
    if (!metricKey) return new Set();
    const scored = (items || [])
      .map((it) => ({ id: it.id, v: Number(it?.[metricKey] || 0) }))
      .filter((x) => x.id && x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 8); // top 8 in dataset
    return new Set(scored.map((x) => x.id));
  }, [items, metricKey]);

  // ─────────────────────────────────────────────
  // Promo Modal
  // ─────────────────────────────────────────────
  const PromoModal = () => {
    if (!promoOpen) return null;

    const code = promo?.code || "PROMO";
    const type = promo?.type || "";
    const discount = promo?.discount ?? "";
    const minOrder = promo?.min_order ?? 0;

    const prettyDiscount =
      type === "percent" ? `${discount}% OFF` : type === "fixed" ? `₱${discount} OFF` : `${discount}`;

    return (
      <div
        className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6"
        onClick={closePromo}
      >
        <div
          className="w-full max-w-md bg-white rounded-t-[26px] md:rounded-[30px] p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Promo</p>
              <h3 className="text-xl font-bold text-slate-800 mt-1">🎁 Limited Offer</h3>
              <p className="text-sm text-slate-600 mt-2">
                Use code <span className="font-mono font-bold text-[#FC687D]">{code}</span>{" "}
                {prettyDiscount ? `— ${prettyDiscount}` : ""}.
              </p>
              {Number(minOrder) > 0 && (
                <p className="text-xs text-slate-500 mt-2">
                  Minimum order: <span className="font-semibold">₱{Number(minOrder).toFixed(0)}</span>
                </p>
              )}
            </div>

            <button
              onClick={closePromo}
              className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="mt-5">
            <button
              onClick={closePromo}
              className="w-full py-3 rounded-xl bg-[#FC687D] text-white text-xs font-bold uppercase tracking-widest active:scale-95"
            >
              View Menu
            </button>
            <p className="text-[10px] text-slate-400 mt-3 text-center">
              This promo shows once per day.
            </p>
          </div>
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FFF5F7] pb-16">
      <PromoModal />

      {selectedItem && (
        <VariantModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        {/* HEADER */}
        <div className="mb-4">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-800">Our Menu</h1>
          <p className="text-sm text-slate-400 mt-1">Browse all available items</p>
        </div>

        {/* CATEGORY DROPDOWN (disabled while searching across ALL) */}
        <div className="mb-4">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            disabled={!!q}
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60"
          >
            {categoryList.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          {q && (
            <p className="text-[11px] text-slate-400 mt-2">
              Searching across all categories (category filter ignored)
            </p>
          )}
        </div>
        
        {/* LOADING */}
        {(loading || promoLoading) && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
          </div>
        )}

        {/* EMPTY */}
        {!loading && !promoOpen && items.length === 0 && (
          <p className="text-center text-slate-400">No items available</p>
        )}

        {/* GRID */}
        {!loading && !promoOpen && items.length > 0 && (
          <>
            <div className="flex items-end justify-between mb-3">
              <h2 className="text-lg font-semibold text-slate-800 uppercase tracking-wider">
                {q ? "Search results" : (selectedCategory || "Menu")}
              </h2>
              <p className="text-xs text-slate-400">{visibleItems.length} item(s)</p>
            </div>

            {visibleItems.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
                No items found.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                {visibleItems.map((item) => {
                  const bestSeller = !!item.is_featured; // Best Seller from is_featured
                  const mostOrdered = mostOrderedIdSet.has(item.id);

                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className="relative text-left bg-white border border-slate-100 rounded-xl p-2 shadow-sm hover:shadow-md transition active:scale-[0.99]"
                    >
                      {/* Badges */}
                      <div className="absolute top-2 left-2 flex gap-1">
                        {bestSeller && (
                          <span className="px-2 py-1 rounded-full bg-[#FC687D] text-white text-[9px] font-bold uppercase tracking-widest shadow">
                            Best Seller
                          </span>
                        )}
                        {mostOrdered && (
                          <span className="px-2 py-1 rounded-full bg-slate-900 text-white text-[9px] font-bold uppercase tracking-widest shadow">
                            Most Ordered
                          </span>
                        )}
                      </div>

                      {/* Image */}                      
                        <div className="w-full aspect-square rounded-lg bg-[#FFF9FA] border border-rose-50 flex items-center justify-center overflow-hidden mb-2 sm:mb-3">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="w-full h-full object-cover object-center"
                            />
                          ) : (
                            <span className="text-xl sm:text-2xl text-rose-200">📷</span>
                          )}
                        </div>

                      {/* Name */}
                      <p className="text-sm font-bold text-slate-800 leading-tight line-clamp-2">
                        {item.name}
                      </p>

                      {/* Category label when searching */}
                      {q && (
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">
                          {item.category || "Others"}
                        </p>
                      )}
                      
                      {/* Price */}
                      <p className="text-sm text-[#FC687D] font-semibold mt-2">
                        ₱{Number(item.price || 0).toFixed(0)}
                      </p>

                      <p className="text-[10px] text-slate-400 mt-2 uppercase tracking-widest">
                        Tap for options
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Variant Modal
   ✅ 2-column options layout
   ❌ No qty / notes / reset
────────────────────────────────────────────────────────────── */
function VariantModal({ item, onClose }) {
  const [selections, setSelections] = useState({});

  const variants = Array.isArray(item?.variants) ? item.variants : [];

  useEffect(() => {
    // default required groups to first option (smooth UX)
    const defaults = {};
    variants.forEach((g) => {
      if (g?.isRequired && Array.isArray(g.options) && g.options.length > 0) {
        defaults[g.id] = [g.options[0]];
      }
    });
    setSelections(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const variantPrice =
    Object.values(selections)
      .flat()
      .reduce((sum, o) => sum + (Number(o.price) || 0), 0) || 0;

  const totalPrice = (Number(item.price) || 0) + variantPrice;

  const requiredOk = variants.every(
    (g) => !g.isRequired || (selections[g.id] || []).length > 0
  );

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-t-[26px] md:rounded-[30px] p-5 md:p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Options</p>
            <h3 className="text-lg md:text-xl font-semibold text-slate-800 mt-1">{item.name}</h3>
            <p className="text-sm text-[#FC687D] font-semibold mt-2">
              ₱{Number(totalPrice).toFixed(0)}
            </p>
            {item.description && (
              <p className="text-[12px] text-slate-500 mt-2 leading-relaxed">
                {item.description}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Variants */}
        {variants.length > 0 ? (
          <div className="mt-5 space-y-5">
            {variants.map((g) => (
              <div key={g.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-700">
                    {g.name} {g.isRequired ? <span className="text-rose-500">*</span> : null}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {g.isMultiSelect ? "Multi" : "Single"}
                  </p>
                </div>

                {/* ✅ 2-column grid */}
                <div className="grid grid-cols-2 gap-2">
                  {(g.options || []).map((o) => {
                    const sel = (selections[g.id] || []).find((x) => x.id === o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => toggleOption(g, o)}
                        className={`p-3 rounded-xl border text-sm text-left transition-all ${
                          sel ? "border-rose-300 bg-rose-50/40" : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="font-medium text-slate-800 leading-tight">{o.name}</div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          {Number(o.price) > 0 ? `+₱${Number(o.price).toFixed(0)}` : "—"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {!requiredOk && (
              <p className="text-xs text-rose-600">
                Please select required options (*).
              </p>
            )}
          </div>
        ) : (
          <div className="mt-5 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm text-slate-600">
            No variants/options for this item.
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-6 py-3 rounded-xl bg-[#FC687D] text-white text-xs font-bold uppercase tracking-widest active:scale-95"
        >
          Close
        </button>
      </div>
    </div>
  );
}
