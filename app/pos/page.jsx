"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

/* --------------------------------------------
   Reusable Modal Shell (overlay + panel)
--------------------------------------------- */
function ModalShell({ children, onClose, className = "" }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Close modal"
      />
      <div
        className={
          "relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl " +
          className
        }
      >
        {children}
      </div>
    </div>
  );
}

/* --------------------------------------------
   Modal: Add / Edit Cart Item (variants + notes)
--------------------------------------------- */
function AddToCartModal({ item, onClose, onAddToCart }) {
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState({});
  const [instructions, setInstructions] = useState("");

  // Build initial selection state either from editData.variantDetails, or required defaults
  useEffect(() => {
    if (!item) return;

    const source = item.editData || item; // FIX: was shown as "\" in file [1](https://onedrive.live.com/?id=7df293e8-6435-4703-b430-d465fb16e1e4&cid=933e55cc8541ec41&web=1)
    setQuantity(source.quantity || 1);
    setInstructions(source.instructions || "");

    // Start with required defaults (if any)
    const next = {};
    if (item.variants?.length) {
      item.variants.forEach((g) => {
        if (g.isRequired && g.options?.length) {
          next[g.id] = [g.options[0]];
        }
      });
    }

    // If editing and variantDetails exists, rehydrate selections by option name
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
            // avoid duplicates
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
    const base = Number(item?.price) || 0; // FIX: was shown as "\" in file [1](https://onedrive.live.com/?id=7df293e8-6435-4703-b430-d465fb16e1e4&cid=933e55cc8541ec41&web=1)
    const addons = Object.values(selections)
      .flat()
      .reduce((sum, o) => sum + (Number(o.price) || 0), 0);
    return base + addons;
  }, [item, selections]);

  const variantDetailsText = useMemo(() => {
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
          className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 hover:text-rose-500"
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
                        "flex justify-between items-center p-4 rounded-xl border text-sm transition-all " +
                        (selected
                          ? "border-rose-300 bg-rose-50/30"
                          : "border-slate-100 bg-white hover:border-slate-200")
                      }
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
          className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none h-20 resize-none focus:bg-slate-100/50 transition-all"
        />
      </div>

      {/* Quantity + Add */}
      <div className="mt-5 flex items-center gap-3">
        <div className="flex items-center overflow-hidden rounded-xl border border-slate-100 bg-white">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="w-14 h-12 text-xl text-slate-400 hover:text-rose-500"
          >
            −
          </button>
          <div className="w-14 h-12 grid place-items-center text-sm font-semibold text-slate-700">
            {quantity}
          </div>
          <button
            type="button"
            onClick={() => setQuantity((q) => q + 1)}
            className="w-14 h-12 text-xl text-slate-400 hover:text-rose-500"
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
              variantDetails: variantDetailsText,
              instructions,
            })
          }
          className={
            "flex-1 py-4 rounded-xl text-white text-sm font-medium shadow-lg transition-all active:scale-[0.98] " +
            (missingRequired ? "bg-slate-300 cursor-not-allowed" : "bg-[#FC687D] hover:brightness-95")
          }
        >
          {missingRequired ? "Select required options" : `Add to Ticket · ₱${total}`}
        </button>
      </div>

      {/* Selected summary */}
      {(variantDetailsText || instructions) && (
        <div className="mt-4 text-xs text-slate-500">
          {variantDetailsText ? <div>Selected: {variantDetailsText}</div> : null}
          {instructions ? <div className="mt-1">Notes: {instructions}</div> : null}
        </div>
      )}
    </ModalShell>
  );
}

/* --------------------------------------------
   Modal: Confirm Clear Cart
--------------------------------------------- */
function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <ModalShell onClose={onCancel} className="p-6">
      <h4 className="text-lg font-semibold text-slate-900">{title}</h4>
      <p className="text-sm text-slate-600 mt-2">{message}</p>
      <div className="mt-6 flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-100 text-slate-700 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-2 rounded-xl bg-rose-500 text-white hover:brightness-95"
        >
          Confirm
        </button>
      </div>
    </ModalShell>
  );
}

/* --------------------------------------------
   Modal: Save Ticket (Park)
--------------------------------------------- */
function SaveTicketModal({ defaultName, onClose, onSave }) {
  const [name, setName] = useState(defaultName || "");

  useEffect(() => {
    setName(defaultName || "");
  }, [defaultName]);

  return (
    <ModalShell onClose={onClose} className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Save Ticket</h3>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 hover:text-rose-500"
        >
          ✕
        </button>
      </div>

      <p className="text-sm text-slate-600 mt-2">Confirm or enter a custom label.</p>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onFocus={(e) => e.target.select()}
        className="w-full mt-6 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 text-sm font-medium outline-none focus:bg-white focus:border-rose-200"
        placeholder="Ticket label"
      />

      <div className="mt-6 flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 py-3 rounded-xl bg-slate-50 border border-slate-100 text-slate-700 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(name)}
          disabled={!name.trim()}
          className="flex-[2] py-3 rounded-xl bg-[#FC687D] text-white font-medium hover:brightness-95 disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          Confirm Save
        </button>
      </div>
    </ModalShell>
  );
}

/* --------------------------------------------
   Modal: Open Tickets (Recall)
--------------------------------------------- */
function OpenTicketsModal({ supabase, onClose, onRecall }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("open_tickets")
        .select("*")
        .order("created_at", { ascending: false });

      if (!alive) return;
      setTickets(data || []);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [supabase]);

  return (
    <ModalShell onClose={onClose} className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Open Tickets</h3>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 hover:text-rose-500"
        >
          ✕
        </button>
      </div>

      <div className="mt-5">
        {loading ? (
          <div className="text-sm text-slate-600">Loading...</div>
        ) : tickets.length === 0 ? (
          <div className="text-sm text-slate-600">No parked orders</div>
        ) : (
          <div className="space-y-2">
            {tickets.map((t) => (
              <button
                key={t.id}
                onClick={() => onRecall(t)}
                className="w-full bg-slate-50/50 hover:bg-[#FDF7F8] border border-slate-100 hover:border-[#FC687D]/20 p-4 rounded-2xl text-left transition-all flex justify-between items-center"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 truncate">
                    {t.ticket_name}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    ₱{Number(t.total_amount || 0).toFixed(0)} • {t.order_type || "—"}
                  </div>
                </div>
                <div className="text-sm text-rose-500 font-semibold">Recall ➔</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

/* --------------------------------------------
   MAIN POS TERMINAL
--------------------------------------------- */
export default function POSPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [diningOptions, setDiningOptions] = useState([]);
  const [orderType, setOrderType] = useState("");

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

  // Added missing modals + wiring (from your earlier version)
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [openTicketsOpen, setOpenTicketsOpen] = useState(false);
  const [activeTicketId, setActiveTicketId] = useState(null);

  const searchRef = useRef(null);

  useEffect(() => {
    // Auth gate (same intention as your current file) [1](https://onedrive.live.com/?id=7df293e8-6435-4703-b430-d465fb16e1e4&cid=933e55cc8541ec41&web=1)
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
    const [iRes, catRes, cRes, diningOptionsRes] = await Promise.all([
      supabase
        .from("menu_items")
        .select("*")
        .eq("is_available", true)
        .order("name"),
      supabase.from("menu_categories").select("*").order("sort_order"),
      supabase
        .from("loyalty_members")
        .select('id, name:"Customer name", code:"Customer code"'),
      supabase
        .from("dining_options")
        .select("*")
        .eq("is_available", true)
        .order("id"),
    ]);

    if (iRes.data) setItems(iRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (cRes.data) setCustomers(cRes.data);
    if (diningOptionsRes.data) {
      setDiningOptions(diningOptionsRes.data);
      // pick first as default if none selected
      setOrderType((prev) => prev || diningOptionsRes.data?.[0]?.name || "");
    }

    setLoading(false);
  }

  const subtotal = useMemo(
    () => cart.reduce((sum, i) => sum + (Number(i.unitPrice) || 0) * (Number(i.quantity) || 0), 0),
    [cart]
  );

  const filteredMenuItems = useMemo(() => {
    const s = menuSearch.toLowerCase();
    return items
      .filter(
        (i) =>
          (activeCategory === "ALL" || i.category === activeCategory) &&
          i.name.toLowerCase().includes(s)
      );
  }, [items, activeCategory, menuSearch]);

  const filteredCustomers = useMemo(() => {
    const s = customerSearch.toLowerCase();
    if (!s) return [];
    return customers.filter(
      (c) => c?.name?.toLowerCase().includes(s) || c?.code?.toLowerCase().includes(s)
    );
  }, [customers, customerSearch]);

  const handleScanSubmit = (e) => {
    e.preventDefault();
    const q = customerSearch.trim().toLowerCase();
    if (!q) return;

    // FIX: in your file this was shown as "\" between conditions; should be OR [1](https://onedrive.live.com/?id=7df293e8-6435-4703-b430-d465fb16e1e4&cid=933e55cc8541ec41&web=1)
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

  const handleSaveTicket = async (ticketName) => {
    if (!cart.length) return;

    const payload = {
      ticket_name: ticketName,
      customer_id: attachedCustomer?.id || null,
      items: cart,
      total_amount: subtotal,
      order_type: orderType,
    };

    // Update existing ticket if recalled/active; otherwise insert
    if (activeTicketId) payload.id = activeTicketId;

    const { error } = await supabase.from("open_tickets").upsert([payload]);
    if (!error) {
      setCart([]);
      setAttachedCustomer(null);
      setActiveTicketId(null);
      setCustomerSearch("");
      setSaveModalOpen(false);
      setMobileCartOpen(false);
    }
  };

  const handleRecallTicket = (ticket) => {
    setCart(ticket.items || []);
    setOrderType(ticket.order_type || "");
    setActiveTicketId(ticket.id);

    if (ticket.customer_id) {
      const cust = customers.find((c) => c.id === ticket.customer_id);
      setAttachedCustomer(cust || null);
    } else {
      setAttachedCustomer(null);
    }

    setOpenTicketsOpen(false);
    setMobileCartOpen(true);
  };

  if (loading) return <div className="p-6 text-sm text-slate-600">Loading…</div>;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl p-4 md:p-6 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* LEFT: MENU */}
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

          {/* MENU GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredMenuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedItemForModal(item)}
                className="group relative flex items-center p-3 bg-white border border-slate-100 rounded-2xl cursor-pointer transition-all hover:-translate-y-[4px] hover:shadow-[0_20px_40px_rgba(252,104,125,0.12)] text-left"
                style={{
                  transitionTimingFunction: "cubic-bezier(0.25,0.46,0.45,0.94)",
                  transitionDuration: "0.35s",
                }}
              >
                {/* Image */}
                <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden grid place-items-center flex-shrink-0">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-slate-400">No image</span>
                  )}
                </div>

                {/* Text */}
                <div className="ml-3 min-w-0">
                  <div className="text-[11px] text-slate-400">
                    {item.category || "General"}
                  </div>
                  <div className="font-semibold text-slate-900 truncate">{item.name}</div>
                  <div className="text-sm text-slate-600 mt-1">
                    ₱{Number(item.price || 0).toFixed(0)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT: TICKET */}
        <div className="lg:sticky lg:top-6 h-fit">
          {/* Mobile floating open button */}
          {cart.length > 0 && !mobileCartOpen && (
            <button
              onClick={() => setMobileCartOpen(true)}
              className="fixed bottom-4 left-4 right-4 z-40 lg:hidden w-auto bg-slate-900 text-white flex items-center justify-between px-5 py-4 rounded-2xl shadow-2xl active:scale-[0.98] transition-all"
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
                <div className="text-xs text-slate-400">
                  {activeTicketId ? "Editing Ticket" : "New Ticket"}
                </div>
                <div className="font-semibold text-slate-900 truncate">
                  {attachedCustomer ? attachedCustomer.name : "New Ticket"}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Clear */}
                <button
                  onClick={() => setConfirmClear(true)}
                  className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 text-slate-400 hover:text-rose-500"
                  title="Clear"
                >
                  ✕
                </button>

                {/* Save (📥) - now wired */}
                <button
                  onClick={() => setSaveModalOpen(true)}
                  className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 hover:text-[#FC687D]"
                  title="Save Ticket"
                  disabled={cart.length === 0}
                >
                  📥
                </button>

                {/* Open Tickets (📋) - now wired */}
                <button
                  onClick={() => setOpenTicketsOpen(true)}
                  className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 hover:text-[#FC687D]"
                  title="Open Tickets"
                >
                  📋
                </button>
              </div>
            </div>

            {/* Scan + customer search */}
            <form onSubmit={handleScanSubmit} className="mt-4" ref={searchRef}>
              <div className="flex items-center gap-2">
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

            {/* Order Type */}
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

            {/* Cart Items */}
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

              {/* Charge Order - kept as button (you can wire to payment flow later) */}
              <button
                className="w-full mt-4 py-4 rounded-2xl bg-slate-900 text-white font-semibold hover:brightness-95 active:scale-[0.98] transition-all disabled:bg-slate-300 disabled:cursor-not-allowed"
                disabled={cart.length === 0}
                onClick={() => alert("Hook this to your payment/checkout flow.")}
              >
                Charge Order
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODALS */}
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
            setActiveTicketId(null);
            setConfirmClear(false);
            setMobileCartOpen(false);
          }}
        />
      )}

      {saveModalOpen && (
        <SaveTicketModal
          defaultName={attachedCustomer ? `${attachedCustomer.name} (${orderType})` : (orderType || "Quick Order")}
          onClose={() => setSaveModalOpen(false)}
          onSave={handleSaveTicket}
        />
      )}

      {openTicketsOpen && (
        <OpenTicketsModal
          supabase={supabase}
          onClose={() => setOpenTicketsOpen(false)}
          onRecall={handleRecallTicket}
        />
      )}
    </div>
  );
}