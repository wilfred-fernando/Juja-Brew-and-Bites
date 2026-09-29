"use client";

import { PublicNav as Nav } from "@/components/PublicNav";
import { PublicFooter as Footer } from "@/components/PublicFooter";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { menuCardPrice } from "@/lib/menuPricing";
import { isMenuItemVisibleToCustomers } from "@/lib/menuVisibility";

const hasMenuOptions = (item) =>
  Array.isArray(item?.variants) &&
  item.variants.some((group) => (Array.isArray(group?.options) ? group.options.length > 0 : true));

// One clean declaration using your client factory function
const supabase = getSupabaseClient();

const peso0 = (amount) => `₱${Number(amount || 0).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;

// ─── Shared Nav (Integrated Perfectly) ───────────────────────────────────────


// ─── Shared Footer ────────────────────────────────────────────────────────────


// ─── Public Menu Page ─────────────────────────────────────────────────────────
export default function PublicMenuPage() {
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  
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

      const { data, error } = await supabase
        .from("promotions")
        .select("*")
        .eq("is_active", true)
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

      const res = await fetch("/api/menu-data?mode=public");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to load menu.");

      const itemsData = json.items || [];
      const catsData  = json.categories || [];

      // Only allow items from visible categories
      const allowedCatNames = new Set(catsData.map(c => c.name));
      const safeItems = itemsData.filter((i) => isMenuItemVisibleToCustomers(i) && allowedCatNames.has(i.category));

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
    return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [cats, items]);

  useEffect(() => {
    if (promoOpen) return undefined;

    const channel = supabase
      .channel("public-menu-item-availability")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "menu_items" },
        (payload) => {
          const nextItem = payload.new || {};
          const previousItem = payload.old || {};
          const rowId = nextItem.id || previousItem.id;
          if (!rowId) return;

          if (payload.eventType === "DELETE" || !isMenuItemVisibleToCustomers(nextItem)) {
            setItems((prev) => prev.filter((item) => item.id !== rowId));
            return;
          }

          const allowedCategories = new Set((cats || []).map((cat) => cat.name));
          if (!allowedCategories.has(nextItem.category)) return;
          setItems((prev) => (prev.some((item) => item.id === rowId) ? prev.map((item) => (item.id === rowId ? nextItem : item)) : [...prev, nextItem]));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [promoOpen, cats]);

  // 4) Search across ALL items
  const q = search.trim().toLowerCase();

  const visibleItems = useMemo(() => {
    if (!items?.length) return [];
    if (q) {
      return items.filter((i) => (i.name || "").toLowerCase().includes(q));
    }
    if (selectedCategory === "ALL") return items;
    return items.filter((i) => (i.category || "Others") === selectedCategory);
  }, [items, q, selectedCategory]);

  const visibleItemGroups = useMemo(() => {
    if (q || selectedCategory !== "ALL") return [{ category: null, items: visibleItems }];
    return categoryList
      .map((category) => ({
        category,
        items: visibleItems.filter((item) => (item.category || "Others") === category),
      }))
      .filter((group) => group.items.length > 0);
  }, [categoryList, q, selectedCategory, visibleItems]);

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

  // ─── Promo Modal ────────────────────────────────────────────────────────────
  const PromoModal = () => {
    if (!promoOpen) return null;

    const code = promo?.code || "PROMO";
    const type = promo?.discount_type || promo?.type || "";
    const discount = promo?.discount_value ?? promo?.discount ?? "";
    const minOrder = promo?.min_order ?? 0;

    const prettyDiscount =
      Number(discount || 0) <= 0
        ? promo?.title || "Featured Promo"
        : type === "percent"
          ? `${discount}% OFF`
          : type === "fixed"
            ? `PHP ${Number(discount || 0).toLocaleString("en-PH")} OFF`
            : `${discount}`;
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
                  Minimum order: <span className="font-semibold">{peso0(minOrder)}</span>
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

  return (
    <div className="juja-page-bg flex min-h-screen flex-col bg-transparent pb-16 pt-24 md:pt-28 lg:h-screen lg:overflow-hidden lg:pb-0">
      <Nav active="menu" />
      <PromoModal />

      {selectedItem && (
        <VariantModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}

      <main className="mx-auto min-h-0 w-full max-w-6xl flex-1 px-4 py-6 md:px-6 lg:overflow-y-auto">
        {/* HEADER */}
        <div className="mb-4">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-800">Our Menu</h1>
          <p className="text-sm text-slate-400 mt-1">Browse all available items</p>
        </div>

        {/* CATEGORY DROPDOWN */}
        <div className="mb-4">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            disabled={!!q}
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60"
          >
            <option value="ALL">All Categories</option>
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
                {q ? "Search results" : (selectedCategory === "ALL" ? "All Categories" : selectedCategory)}
              </h2>
              <p className="text-xs text-slate-400">{visibleItems.length} item(s)</p>
            </div>

            {visibleItems.length === 0 ? (
              <div className="bg-white/90 border border-slate-200 rounded-2xl p-8 text-center text-slate-500 backdrop-blur-sm">
                No items found.
              </div>
            ) : (
              <div className="space-y-8">
                {visibleItemGroups.map((group) => (
                  <section key={group.category || "items"}>
                    {group.category && (
                      <h3 className="mb-3 text-base font-semibold uppercase tracking-wider text-slate-700">
                        {group.category}
                      </h3>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                      {group.items.map((item) => {
                  const bestSeller = !!item.is_featured;
                  const mostOrdered = mostOrderedIdSet.has(item.id);

                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className="relative text-left bg-white/95 border border-slate-100 rounded-xl p-2 shadow-sm backdrop-blur-sm hover:shadow-md transition active:scale-[0.99]"
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
                      <p className="text-sm font-bold uppercase text-center text-slate-800 leading-tight line-clamp-2">
                        {item.name}
                      </p>

                      {/* Category label when searching */}
                      {q && (
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">
                          {item.category || "Others"}
                        </p>
                      )}
                      
                      {/* Price */}
                      <p className="text-[18px] text-[#FC687D] text-center font-semibold mt-3">
                        {peso0(menuCardPrice(item))}
                      </p>

                      {hasMenuOptions(item) && (
                        <p className="mt-2 text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Tap for options
                        </p>
                      )}
                    </button>
                  );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Variant Modal
────────────────────────────────────────────────────────────── */
function optionGroupMaxSelection(group) {
  const value = Number(group?.maxSelection ?? group?.max_selection ?? group?.maxSelections ?? group?.max_selections);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : null;
}

function VariantModal({ item, onClose }) {
  const [selections, setSelections] = useState({});

  const variants = Array.isArray(item?.variants)
    ? item.variants.filter((g) => (
        g?.isRequired
        && !g?.posOnly
        && !g?.hidePublic
        && !g?.hide_public
        && g?.isAvailable !== false
        && g?.is_available !== false
      ))
    : [];

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
      const maxSelection = optionGroupMaxSelection(group);
      if (!exists && maxSelection && current.length >= maxSelection) return;
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
        className="w-full max-w-md bg-black/40 rounded-t-[26px] md:rounded-[30px] p-5 md:p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start text-white justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400"></p>
            <p className="text-lg md:text-xl font-semibold text-slate-800">{item.name}</p>
            <p className="text-[18px] text-[#FC687D] font-semibold mt-2">
              {peso0(totalPrice)}
            </p>
            {item.description && (
              <p className="text-[12px] italic text-slate-500 leading-relaxed">
                {item.description}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400"
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
                <div className="flex items-center text-white justify-between">
                  <p className="text-[12px] font-normal text-slate-700">
                    {g.name} {g.isRequired ? <span className="text-rose-500">*</span> : null}
                  </p>
                  <p className="text-[12px] italic text-slate-400">
                    {g.isMultiSelect ? `Multi-Select${optionGroupMaxSelection(g) ? ` up to ${optionGroupMaxSelection(g)}` : ""}` : "Required"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {(g.options || []).map((o) => {
                    const sel = (selections[g.id] || []).find((x) => x.id === o.id);
                    const maxSelection = optionGroupMaxSelection(g);
                    const blocked = !!(g.isMultiSelect && !sel && maxSelection && (selections[g.id] || []).length >= maxSelection);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => toggleOption(g, o)}
                        className={`p-1 rounded-[2px] border text-sm text-left transition-all ${
                          sel ? "border-slate-200 bg-slate-100" : "border-slate-200 bg-white/70"
                        } ${blocked ? "opacity-45" : ""}`}
                      >
                        <div className="font-medium font-bold text-slate-800 leading-tight">{o.name}</div>
                        <div className="text-[15px] font-semibold text-slate-500 mt-1">
                          {Number(o.price) > 0 ? `+${peso0(o.price)}` : "—"}
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
