"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

/* -------------------------------------------------------
   Modal Shell (consistent overlay + "luxury" panel feel)
-------------------------------------------------------- */
function ModalShell({ children, onClose, className = "" }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Close modal backdrop"
      />
      <div
        className={
          "relative z-10 w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-100 " +
          className
        }
        style={{
          transition: "all 0.35s cubic-bezier(0.25,0.46,0.45,0.94)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   ADD TO CART MODAL (Variants + instructions + edit mode)
-------------------------------------------------------- */
function AddToCartModal({ item, onClose, onAddToCart }) {
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState({});
  const [instructions, setInstructions] = useState("");

  useEffect(() => {
    if (!item) return;

    // FIX: PosPage_5 had a broken fallback operator in export text;
    // correct intent is "editData || item"
    const source = item.editData || item;

    setQuantity(source.quantity || 1);
    setInstructions(source.instructions || "");

    // Start with required defaults
    const next = {};
    if (item.variants?.length) {
      item.variants.forEach((g) => {
        if (g.isRequired && g.options?.length) {
          next[g.id] = [g.options[0]];
        }
      });
    }

    // If editing and variantDetails exists, rehydrate by option name
    if (source.variantDetails && item.variants?.length) {
      const names = String(source.variantDetails)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      names.forEach((name) => {
        item.variants.forEach((g) => {
          const match = g.options?.find((o) => o.name === name);
          if (match) {
            next[g.id] = next[g.id] || [];
            if (!next[g.id].some((x) => x.id === match.id)) next[g.id].push(match);
          }
        });
      });
    }

    setSelections(next);
  }, [item]);

  const toggleOption = (group, opt) => {
    const current = selections[group.id] || [];
    if (!group.isMultiSelect) {
      setSelections({ ...selections, [group.id]: [opt] });
      return;
    }
    const exists = current.some((o) => o.id === opt.id);
    setSelections({
      ...selections,
      [group.id]: exists ? current.filter((o) => o.id !== opt.id) : [...current, opt],
    });
  };

  const unitPrice = useMemo(() => {
    const base = Number(item?.price) || 0;
    const addons = Object.values(selections)
      .flat()
      .reduce((sum, o) => sum + (Number(o.price) || 0), 0);
    return base + addons;
  }, [item, selections]);

  const variantDetails = useMemo(() => {
    return Object.values(selections)
      .flat()
      .map((o) => o.name)
      .join(", ");
  }, [selections]);

  const missingRequired = useMemo(() => {
    if (!item?.variants?.length) return false;
    return item.variants.some((g) => g.isRequired && !(selections[g.id]?.length > 0));
  }, [item, selections]);

  const total = (unitPrice * quantity).toFixed(0);

  return (
    <ModalShell onClose={onClose} className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{item?.name}</h3>
          <p className="text-xs text-slate-500 mt-1">
            Base ₱{(Number(item?.price) || 0).toFixed(0)}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-100 text-slate-500 hover:text-rose-500 transition-colors"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Variants */}
      {item?.variants?.length > 0 && (
        <div className="mt-5 space-y-5">
          {item.variants.map((g) => (
            <div key={g.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-800">{g.name}</p>
                {g.isRequired && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-100">
                    Required
                  </span>
                )}
                {g.isMultiSelect && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-100">
                    Multi
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2">
                {g.options?.map((o) => {
                  const selected = selections[g.id]?.some((x) => x.id === o.id);
                  return (
                    <button
                      type="button"
                      key={o.id}
                      onClick={() => toggleOption(g, o)}
                      className={
                        "flex justify-between items-center p-4 rounded-2xl border text-sm transition-all " +
                        (selected
                          ? "border-rose-300 bg-rose-50/30"
                          : "border-slate-100 bg-white hover:border-slate-200")
                      }
                      style={{
                        transition: "all 0.35s cubic-bezier(0.25,0.46,0.45,0.94)",
                      }}
                    >
                      <span className="font-medium text-slate-800">{o.name}</span>
                      <span className="text-slate-500">
                        {Number(o.price) > 0 ? `+₱${Number(o.price).toFixed(0)}` : "—"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Special Instructions */}
      <div className="mt-5">
        <p className="text-sm font-semibold text-slate-800 mb-2">Special Instructions</p>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Add specific notes..."
          className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm outline-none h-20 resize-none focus:bg-slate-100/50 transition-all"
        />
      </div>

      {/* Quantity + Add */}
      <div className="mt-5 flex items-center gap-3">
        <div className="flex items-center overflow-hidden rounded-2xl border border-slate-100 bg-white">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="w-14 h-12 text-xl text-slate-400 hover:text-rose-500 transition-colors"
          >
            −
          </button>
          <div className="w-14 h-12 grid place-items-center text-sm font-semibold text-slate-700">
            {quantity}
          </div>
          <button
            type="button"
            onClick={() => setQuantity((q) => q + 1)}
            className="w-14 h-12 text-xl text-slate-400 hover:text-rose-500 transition-colors"
          >
            +
          </button>
        </div>

        <button
          type="button"
          disabled={missingRequired}
          onClick={() =>
            onAddToCart({
              ...item,
              cartItemId: item?.editData?.cartItemId || Date.now(),
              unitPrice,
              quantity,
              variantDetails,
              instructions,
            })
          }
          className={
            "flex-1 py-4 rounded-2xl text-white text-sm font-medium shadow-lg transition-all active:scale-[0.98] " +
            (missingRequired ? "bg-slate-300 cursor-not-allowed" : "bg-[#FC687D] hover:brightness-95")
          }
          style={{ transition: "all 0.35s cubic-bezier(0.25,0.46,0.45,0.94)" }}
        >
          {missingRequired ? "Select required options" : `Add to Ticket · ₱${total}`}
        </button>
      </div>
    </ModalShell>
  );
}

/* -------------------------------------------------------
   Confirm Modal (Clear cart)
-------------------------------------------------------- */
function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <ModalShell onClose={onCancel} className="p-6">
      <h4 className="text-lg font-semibold text-slate-900">{title}</h4>
      <p className="text-sm text-slate-600 mt-2">{message}</p>
      <div className="mt-6 flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-2xl bg-slate-50 border border-slate-100 text-slate-700 hover:bg-slate-100 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-2 rounded-2xl bg-rose-500 text-white hover:brightness-95 transition-all active:scale-[0.98]"
          style={{ transition: "all 0.35s cubic-bezier(0.25,0.46,0.45,0.94)" }}
        >
          Confirm
        </button>
      </div>
    </ModalShell>
  );
}

/* -------------------------------------------------------
   MAIN POS TERMINAL (PosPage_5 with luxury + responsive)
-------------------------------------------------------- */
export default function POSPage() {
  // FIX: Do not import supabase AND redeclare it. PosPage_5 had that conflict. [1](https://onedrive.live.com/?id=7df293e8-6435-4703-b430-d465fb16e1e4&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com?cid=933E55CC8541EC41&id=933E55CC8541EC41!s7df293e864354703b430d465fb16e1e4)
  const supabase = useMemo(() => createBrowserClient(), []);

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [diningOptions, setDiningOptions] = useState([]);

  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeCategory, setActiveCategory] = useState("ALL");
  const [menuSearch, setMenuSearch] = useState("");

  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustListOpen, setIsCustListOpen] = useState(false);

  const [attachedCustomer, setAttachedCustomer] = useState(null);
  const [selectedItemForModal, setSelectedItemForModal] = useState(null);

  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const [orderType, setOrderType] = useState("");

  const searchRef = useRef(null);

  // 1) Auth gate + data init (same intent as PosPage_5) [1](https://onedrive.live.com/?id=7df293e8-6435-4703-b430-d465fb16e1e4&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com?cid=933E55CC8541EC41&id=933E55CC8541EC41!s7df293e864354703b430d465fb16e1e4)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) window.location.href = "/login";
      else fetchData();
    });

    const close = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setIsCustListOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchData() {
    setLoading(true);

    const [iRes, catRes, cRes, diningRes] = await Promise.all([
      supabase.from("menu_items").select("*").eq("is_available", true).order("name"),
      supabase.from("menu_categories").select("*").order("sort_order"),
      supabase.from("loyalty_members").select('id, name:"Customer name", code:"Customer code"'),
      supabase.from("dining_options").select("*").eq("is_available", true).order("id"),
    ]);

    if (iRes.data) setItems(iRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (cRes.data) setCustomers(cRes.data);

    if (diningRes.data) {
      setDiningOptions(diningRes.data);
      setOrderType((prev) => prev || diningRes.data?.[0]?.name || "");
    }

    setLoading(false);
  }

  const subtotal = useMemo(() => {
    return cart.reduce(
      (sum, i) => sum + (Number(i.unitPrice) || 0) * (Number(i.quantity) || 0),
      0
    );
  }, [cart]);

  // 2) Barcode / loyalty scan logic (FIX: PosPage_5 used broken "\" for OR) [1](https://onedrive.live.com/?id=7df293e8-6435-4703-b430-d465fb16e1e4&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com?cid=933E55CC8541EC41&id=933E55CC8541EC41!s7df293e864354703b430d465fb16e1e4)
  const handleScanSubmit = (e) => {
    e.preventDefault();
    const q = customerSearch.trim().toLowerCase();
    if (!q) return;

    const matchItem = items.find(
      (i) => i.sku?.toLowerCase() === q || i.name?.toLowerCase() === q
    );

    if (matchItem) {
      setSelectedItemForModal(matchItem);
      setCustomerSearch("");
      setIsCustListOpen(false);
      return;
    }

    const matchCust = customers.find(
      (c) => c.code?.toLowerCase() === q || c.name?.toLowerCase().includes(q)
    );

    if (matchCust) {
      setAttachedCustomer(matchCust);
      setCustomerSearch("");
      setIsCustListOpen(false);
    }
  };

  // Filter menu
  const filteredMenuItems = useMemo(() => {
    const s = menuSearch.toLowerCase();
    return items
      .filter(
        (i) =>
          (activeCategory === "ALL" || i.category === activeCategory) &&
          i.name?.toLowerCase().includes(s)
      );
  }, [items, activeCategory, menuSearch]);

  // Customer dropdown filter
  const filteredCustomers = useMemo(() => {
    const s = customerSearch.toLowerCase();
    if (!s) return [];
    return customers.filter(
      (c) => c?.name?.toLowerCase().includes(s) || c?.code?.toLowerCase().includes(s)
    );
  }, [customers, customerSearch]);

  // 3) Save ticket (kept as prompt to match PosPage_5 intent) [1](https://onedrive.live.com/?id=7df293e8-6435-4703-b430-d465fb16e1e4&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com?cid=933E55CC8541EC41&id=933E55CC8541EC41!s7df293e864354703b430d465fb16e1e4)
  const handleSaveTicket = async () => {
    if (cart.length === 0) return;

    const label = prompt(
      "Enter Ticket Label:",
      attachedCustomer?.name || "Quick Order"
    );
    if (!label) return;

    const { error } = await supabase.from("open_tickets").insert([
      {
        ticket_name: label,
        customer_id: attachedCustomer?.id || null,
        items: cart,
        total_amount: subtotal,
        order_type: orderType,
      },
    ]);

    if (!error) {
      setCart([]);
      setAttachedCustomer(null);
      alert("Ticket Saved!");
    }
  };

  if (loading) return <div className="p-6 text-sm text-slate-600">Loading…</div>;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-7xl p-4 md:p-6 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* ---------------- MENU SECTION ---------------- */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-xl font-semibold text-slate-900">Terminal</h2>

            <div className="flex items-center gap-2">
              <select
                value={activeCategory}
                onChange={(e) => setActiveCategory(e.target.value)}
                className="bg-slate-50 px-3 py-2 rounded-lg text-xs outline-none border border-slate-100"
              >
                <option value="ALL">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>

              <input
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                className="w-full max-w-[200px] px-3 py-2 bg-slate-50 rounded-lg text-xs outline-none border border-slate-100 focus:bg-white"
                placeholder="Search menu…"
              />
            </div>
          </div>

          {/* ✅ Responsive Grid: Mobile 1 col, Tablet 3, Desktop 4 */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredMenuItems.map((item, index) => (
              <button
                key={item.id}
                onClick={() => setSelectedItemForModal(item)}
                className="
                  group relative flex items-center p-3 bg-white border border-slate-100 rounded-2xl cursor-pointer text-left
                  opacity-0 translate-y-2 animate-[menuIn_420ms_ease_forwards]
                  transition-all
                  hover:-translate-y-[12px]
                  hover:shadow-[0_20px_40px_rgba(252,104,125,0.2)]
                "
                style={{
                  // ✅ Luxury motion: same bezier as your original "expensive" feel [1](https://onedrive.live.com/?id=7df293e8-6435-4703-b430-d465fb16e1e4&cid=933e55cc8541ec41&web=1)[2](https://onedrive.live.com?cid=933E55CC8541EC41&id=933E55CC8541EC41!s7df293e864354703b430d465fb16e1e4)
                  transitionTimingFunction: "cubic-bezier(0.25,0.46,0.45,0.94)",
                  transitionDuration: "0.35s",
                  // ✅ Entrance staggering (slower reveal): 100ms steps
                  animationDelay: `${index * 100}ms`,
                }}
              >
                {/* Image Container */}
                <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden grid place-items-center flex-shrink-0">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="
                        w-full h-full object-cover
                        transform scale-100
                        transition-transform duration-[650ms] ease-out
                        group-hover:scale-[1.2]
                      "
                    />
                  ) : (
                    <span className="text-xs text-slate-400">No image</span>
                  )}
                </div>

                {/* Text Details */}
                <div className="ml-3 min-w-0">
                  <div className="text-[11px] text-slate-400">
                    {item.category || "General"}
                  </div>
                  <div className="font-semibold text-slate-900 truncate">{item.name}</div>
                  <div className="text-sm text-slate-600 mt-1">
                    ₱{Number(item.price || 0).toFixed(0)}
                  </div>

                  {/* Optional CTA with color swap (luxury hover) */}
                  <div className="mt-2">
                    <span
                      className="
                        inline-flex items-center justify-center px-3 py-1.5 rounded-xl text-xs font-semibold
                        bg-[#FFF5F7] text-[#FC687D]
                        transition-colors duration-300
                        group-hover:bg-[#FC687D] group-hover:text-white
                      "
                    >
                      Add
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ---------------- TICKET SIDEBAR ---------------- */}
        <div className="lg:sticky lg:top-6 h-fit">
          {/* Mobile floating cart button */}
          {cart.length > 0 && !mobileCartOpen && (
            <button
              onClick={() => setMobileCartOpen(true)}
              className="fixed bottom-4 left-4 right-4 z-40 lg:hidden w-auto bg-slate-900 text-white flex items-center justify-between px-5 py-4 rounded-2xl shadow-2xl active:scale-[0.98] transition-all"
              style={{ transition: "all 0.35s cubic-bezier(0.25,0.46,0.45,0.94)" }}
            >
              <div>
                <div className="font-semibold">Current Ticket</div>
                <div className="text-xs text-white/70">
                  {cart.length} item{cart.length > 1 ? "s" : ""}
                </div>
              </div>
              <div className="font-semibold">₱{subtotal.toFixed(0)} 🛒</div>
            </button>
          )}

          <div
            className={
              "bg-white border border-slate-100 rounded-3xl shadow-sm p-4 lg:p-5 " +
              (mobileCartOpen ? "" : "hidden lg:block")
            }
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
              <button
                className="lg:hidden w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 text-slate-500"
                onClick={() => setMobileCartOpen(false)}
                aria-label="Close ticket panel"
              >
                ←
              </button>

              <div className="min-w-0">
                <div className="text-xs text-slate-400">Ticket</div>
                <div className="font-semibold text-slate-900 truncate">
                  {attachedCustomer ? attachedCustomer.name : "New Ticket"}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Clear */}
                <button
                  onClick={() => setConfirmClear(true)}
                  className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 text-slate-400 hover:text-rose-500 transition-colors"
                  title="Clear"
                >
                  ✕
                </button>

                {/* Save ticket (kept from PosPage_5 UI icons) */}
                <button
                  onClick={handleSaveTicket}
                  className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 hover:text-[#FC687D] transition-colors disabled:opacity-40"
                  title="Save Ticket"
                  disabled={cart.length === 0}
                >
                  📥
                </button>

                {/* Placeholder for open tickets (icon existed in PosPage_5 layout) */}
                <button
                  onClick={() => alert("Hook this to an Open Tickets modal if needed.")}
                  className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 hover:text-[#FC687D] transition-colors"
                  title="Open Tickets"
                >
                  📋
                </button>
              </div>
            </div>

            {/* Scan input */}
            <form onSubmit={handleScanSubmit} className="mt-4" ref={searchRef}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => document.getElementById("scan-in")?.focus()}
                  className="text-slate-300 font-bold text-sm hover:text-rose-400 transition-colors"
                  title="Focus Scanner"
                >
                  ⌁
                </button>

                <input
                  id="scan-in"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setIsCustListOpen(true);
                  }}
                  onFocus={() => setIsCustListOpen(true)}
                  className="flex-1 px-3 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:bg-white"
                  placeholder="Scan / Search customer or item…"
                />

                <button
                  type="submit"
                  className="px-4 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:brightness-95"
                >
                  Enter
                </button>
              </div>

              {isCustListOpen && customerSearch.length > 0 && (
                <div className="mt-2 bg-white border border-slate-100 rounded-2xl overflow-hidden">
                  {filteredCustomers.length === 0 ? (
                    <div className="p-3 text-xs text-slate-500">No customer found</div>
                  ) : (
                    filteredCustomers.slice(0, 8).map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => {
                          setAttachedCustomer(c);
                          setIsCustListOpen(false);
                          setCustomerSearch("");
                        }}
                        className="w-full text-left p-3 hover:bg-rose-50 text-xs font-medium"
                      >
                        {c.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </form>

            {/* Order type */}
            <div className="mt-4">
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value)}
                className="w-full appearance-none bg-slate-100 border-2 border-transparent text-slate-700 text-sm font-bold rounded-xl px-4 py-3 outline-none focus:border-[#FC687D] focus:bg-white transition-all cursor-pointer"
              >
                {diningOptions.map((opt) => (
                  <option key={opt.id} value={opt.name}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Cart items */}
            <div className="mt-4 space-y-3">
              {cart.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">
                  Empty Ticket
                </div>
              ) : (
                cart.map((ci, idx) => (
                  <div
                    key={ci.cartItemId}
                    className="flex justify-between items-start gap-3 border-b border-slate-50 pb-3"
                  >
                    <button
                      className="flex-1 text-left"
                      onClick={() => {
                        const baseItem = items.find((i) => i.id === ci.id) || ci;
                        setSelectedItemForModal({
                          ...baseItem,
                          editData: ci,
                          editIndex: idx,
                        });
                      }}
                    >
                      <div className="font-semibold text-slate-900 text-sm">
                        {ci.name} <span className="text-slate-400">x{ci.quantity}</span>
                      </div>
                      {ci.variantDetails ? (
                        <div className="text-xs text-slate-500 mt-1">{ci.variantDetails}</div>
                      ) : null}
                      {ci.instructions ? (
                        <div className="text-xs text-slate-400 mt-1">Note: {ci.instructions}</div>
                      ) : null}
                    </button>

                    <div className="text-right">
                      <div className="font-semibold text-slate-900 text-sm">
                        ₱{((Number(ci.unitPrice) || 0) * (Number(ci.quantity) || 0)).toFixed(0)}
                      </div>
                      <button
                        className="text-[11px] text-slate-300 hover:text-red-500 mt-1 transition-colors underline"
                        onClick={() => {
                          setCart((prev) => {
                            const next = [...prev];
                            next.splice(idx, 1);
                            return next;
                          });
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">TOTAL</div>
                <div className="text-sm font-semibold text-slate-900">
                  ₱{subtotal.toFixed(0)}
                </div>
              </div>

              <button
                className="w-full mt-4 py-4 rounded-2xl bg-slate-900 text-white font-semibold hover:brightness-95 active:scale-[0.98] transition-all disabled:bg-slate-300 disabled:cursor-not-allowed"
                disabled={cart.length === 0}
                onClick={() => alert("Hook this to your payment/checkout flow.")}
                style={{ transition: "all 0.35s cubic-bezier(0.25,0.46,0.45,0.94)" }}
              >
                Charge Order
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {selectedItemForModal && (
        <AddToCartModal
          item={selectedItemForModal}
          onClose={() => setSelectedItemForModal(null)}
          onAddToCart={(d) => {
            setCart((prev) => {
              const editIndex = selectedItemForModal?.editIndex;
              if (editIndex !== undefined && editIndex !== null) {
                const updated = [...prev];
                updated[editIndex] = d;
                return updated;
              }
              return [...prev, d];
            });
            setSelectedItemForModal(null);
          }}
        />
      )}

      {confirmClear && (
        <ConfirmModal
          title="Clear Ticket"
          message="Are you sure you want to clear the current ticket?"
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            setCart([]);
            setAttachedCustomer(null);
            setConfirmClear(false);
            setMobileCartOpen(false);
          }}
        />
      )}

      {/* Entrance animation keyframes */}
      <style jsx global>{`
        @keyframes menuIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}