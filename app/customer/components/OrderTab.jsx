"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();
import AddToCartModal from "./AddToCartModal";

const hasMenuOptions = (item) =>
  Array.isArray(item?.variants) &&
  item.variants.some((group) => (Array.isArray(group?.options) ? group.options.length > 0 : true));

export default function OrderTab() {
  const [items, setItems] = useState([]);
  const [cats, setCategories] = useState([]);
  const [activeTab, setActiveTab] = useState("All");

  const [search, setSearch] = useState("");

  // cart (simple map qty for now)
  const [cart, setCart] = useState({});
  const [loading, setLoading] = useState(true);

  // variants modal
  const [modalItem, setModalItem] = useState(null);

  useEffect(() => {
    async function fetchMenu() {
      setLoading(true);

      const [itemRes, catRes] = await Promise.all([
        supabase.from("menu_items").select("*").eq("is_available", true).order("name"),
        supabase.from("menu_categories").select("*").eq("is_active", true).order("sort_order"),
      ]);

      if (itemRes.data) setItems(itemRes.data);
      if (catRes.data) setCategories(catRes.data);

      setLoading(false);
    }

    fetchMenu();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      const matchesCat = !activeTab || activeTab === "All" ? true : i.category === activeTab;

      if (!q) return matchesCat;

      const hay = `${i.name || ""} ${i.description || ""} ${i.category || ""}`.toLowerCase();
      return matchesCat && hay.includes(q);
    });
  }, [items, activeTab, search]);

  const add = (item) => {
    // If variants exist, use modal (like POS patterns)
    if (Array.isArray(item.variants) && item.variants.length > 0) {
      setModalItem(item);
      return;
    }

    setCart((c) => ({
      ...c,
      [item.id]: c[item.id]
        ? { ...c[item.id], qty: c[item.id].qty + 1 }
        : { id: item.id, name: item.name, price: item.price, qty: 1 },
    }));
  };

  const remove = (id) => {
    setCart((c) => {
      const n = { ...c };
      if (n[id]?.qty > 1) n[id] = { ...n[id], qty: n[id].qty - 1 };
      else delete n[id];
      return n;
    });
  };

  const addFromModal = (cartItem) => {
    // You can store modal items into a separate list later; for now just count it in cart by id
    setCart((c) => ({
      ...c,
      [cartItem.id]: c[cartItem.id]
        ? { ...c[cartItem.id], qty: c[cartItem.id].qty + cartItem.quantity }
        : { id: cartItem.id, name: cartItem.name, price: cartItem.unitPrice, qty: cartItem.quantity },
    }));
  };

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
      {/* Search + Category dropdown */}
      <div className="space-y-2 -mx-4 px-4 sticky top-0 z-20 bg-[#FFF5F7] pt-1 pb-2">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu…"
              className="w-full bg-white border border-rose-100 rounded-xl px-4 py-2.5 text-sm pr-10"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 active:scale-95"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Search button */}
          <button
            type="button"
            onClick={() => document.activeElement?.blur?.()}
            className="px-4 py-2.5 rounded-xl bg-[#FC687D] text-white text-[11px] uppercase tracking-widest active:scale-95 whitespace-nowrap"
          >
            Search
          </button>
        </div>

        <div className="flex gap-2">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
            className="w-full bg-white border border-rose-100 rounded-xl px-4 py-2.5 text-sm"
          >
            <option value="All">All Categories</option>
            {cats.map((cat) => (
              <option key={cat.id} value={cat.name}>
                {cat.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setActiveTab("All");
              setSearch("");
            }}
            className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-[11px] uppercase tracking-widest active:scale-95 whitespace-nowrap"
          >
            Reset
          </button>
        </div>

        <p className="text-[10px] text-slate-400 uppercase tracking-widest">
          Showing {filtered.length} item(s)
        </p>
      </div>

      {/* Items */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 pb-10">
        {filtered.map((item) => {
          const inCart = cart[item.id]?.qty || 0;

          return (
            <div
              key={item.id}
              className="flex flex-col items-center overflow-hidden rounded-xl border border-rose-50 bg-white p-2.5 text-center shadow-sm md:rounded-[24px] md:p-3"
            >
              <div className="h-24 md:h-32 rounded-lg md:rounded-xl bg-slate-50 flex items-center justify-center relative overflow-hidden mb-2 border border-slate-100">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl text-slate-200">📷</span>
                )}
              </div>

              <div className="flex flex-1 flex-col items-center px-1 text-center">
                <p className="mb-1 text-center text-[11px] font-normal leading-tight text-slate-800 md:text-[13px]">
                  {item.name}
                </p>
                <p className="mb-3 text-center text-[13px] font-normal text-[#FC687D] md:text-[15px]">
                  ₱{Number(item.price).toLocaleString()}
                </p>
                {hasMenuOptions(item) && (
                  <p className="mb-3 text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Tap for options
                  </p>
                )}

                <div className="mt-auto">
                  {inCart > 0 ? (
                    <div className="flex items-center justify-between bg-slate-50 p-1 rounded-lg border border-slate-200">
                      <button
                        onClick={() => remove(item.id)}
                        className="w-7 h-7 md:w-8 md:h-8 rounded-[6px] bg-white flex items-center justify-center text-slate-600 font-normal shadow-sm active:scale-90"
                      >
                        −
                      </button>
                      <span className="font-normal text-[12px] md:text-[13px] text-slate-700">
                        {inCart}
                      </span>
                      <button
                        onClick={() => add(item)}
                        className="w-7 h-7 md:w-8 md:h-8 rounded-[6px] bg-[#FC687D] flex items-center justify-center text-white font-normal shadow-sm active:scale-90"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => add(item)}
                      className="w-full py-2 md:py-2.5 rounded-lg text-[9px] md:text-[11px] font-normal uppercase tracking-widest text-[#FC687D] bg-[#FFF9FA] border border-rose-100 hover:bg-[#FC687D] hover:text-white transition-all active:scale-95"
                    >
                      Add to Cart
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Variants modal */}
      {modalItem && (
        <AddToCartModal
          item={modalItem}
          onClose={() => setModalItem(null)}
          onAddToCart={addFromModal}
        />
      )}
    </div>
  );
}
