"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();
import BookingTab from "@/components/BookingForm";

const Barcode = dynamic(() => import("react-barcode"), { ssr: false });

const LOGO =
  "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

function genMemberCode() {
  const n = String(Math.floor(Math.random() * 999999) + 1).padStart(6, "0");
  return `JUJA${new Date().getFullYear()}${n}`;
}

function genCustomerId() {
  return String(Math.floor(1000000 + Math.random() * 9000000));
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString();
}

// Birthday format: YYYY-MMM-DD (e.g. 1995-Dec-25)
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function normalizeBirthday(input) {
  const s = String(input || "").trim();
  if (!s) return { ok: false, value: "", msg: "Birthday is required." };

  const m = s.match(/^(\d{4})-([A-Za-z]{3})-(\d{2})$/);
  if (!m) {
    return { ok: false, value: s, msg: "Birthday must be YYYY-MMM-DD (e.g. 1995-Dec-25)." };
  }

  const yyyy = m[1];
  const monRaw = m[2];
  const dd = m[3];

  const mon = monRaw.charAt(0).toUpperCase() + monRaw.slice(1).toLowerCase();
  if (!MONTHS.includes(mon)) {
    return {
      ok: false,
      value: s,
      msg: "Month must be Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec.",
    };
  }

  const dayNum = Number(dd);
  if (dayNum < 1 || dayNum > 31) {
    return { ok: false, value: s, msg: "Day must be 01 to 31." };
  }

  return { ok: true, value: `${yyyy}-${mon}-${dd}`, msg: "" };
}

/* ──────────────────────────────────────────────────────────────
   Bottom Tab Bar
────────────────────────────────────────────────────────────── */
function TabBar({ tab, setTab }) {
  const tabs = [
    { id: "home", icon: "🏠", label: "Home" },
    { id: "order", icon: "🍽️", label: "Order" },
    { id: "loyalty", icon: "⭐", label: "Loyalty" },
    { id: "booking", icon: "🗓", label: "Book" },
    { id: "profile", icon: "👤", label: "Profile" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-rose-50 pb-safe shadow-[0_-4px_24px_rgba(252,104,125,0.05)]">
      <div className="max-w-md mx-auto grid grid-cols-5 px-1 md:px-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative flex flex-col items-center justify-center py-2.5 md:py-3 gap-0.5 md:gap-1 transition-all duration-300 active:scale-90 ${
              tab === t.id ? "text-[#FC687D]" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <span
              className={`text-[20px] md:text-[22px] leading-none transition-transform duration-300 ${
                tab === t.id ? "scale-110 -translate-y-1" : ""
              }`}
            >
              {t.icon}
            </span>
            <span
              className={`text-[8px] md:text-[9px] font-normal uppercase tracking-widest ${
                tab === t.id ? "text-[#FC687D]" : "text-slate-400"
              }`}
            >
              {t.label}
            </span>

            {tab === t.id && (
              <span className="absolute bottom-1 w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-[#FC687D]" />
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}

/* ──────────────────────────────────────────────────────────────
   Home Tab
────────────────────────────────────────────────────────────── */
function HomeTab({ member, user, setTab }) {
  const availablePts = parseFloat(member?.["Available points"] ?? 0) || 0;
  const totalPts = parseFloat(member?.["Points balance"] ?? 0) || 0;
  const visits = parseFloat(member?.["Total visits"] ?? 0) || 0;

  const [branch, setBranch] = useState("pasongtamo");

  const BRANCHES = {
    pasongtamo: {
      buttonLabel: "Pasong Tamo",
      name: "PASONG TAMO BRANCH",
      address: "36D Visayas Ave., Pasong Tamo, QC",
      phone: "0939-9228383",
      hoursLabel: "OPEN DAILY",
      hours: ["10AM – 12MN"],
      room: ["Function Room: 10AM – 2AM"],
    },
    diliman: {
      buttonLabel: "Diliman",
      name: "DILIMAN BRANCH",
      address: "8 Visayas Ave., Diliman, QC",
      phone: "0961-6320909",
      hoursLabel: "STORE HOURS",
      hours: ["Mon - Wed: 8AM – 10PM", "Thu - Sat: 10AM – 10PM", "Sun: CLOSED"],
      room: [],
    },
  };

  const active = BRANCHES[branch];

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Brand block */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="active:scale-95 transition">
            <img src={LOGO} alt="Juja" className="h-8 md:h-10 w-auto object-contain" />
          </Link>

          <div className="leading-tight">
            <p className="text-[10px] md:text-[11px] uppercase tracking-widest text-slate-400">
              Juja Brew & Bites
            </p>
            <p className="text-[12px] md:text-[13px] text-slate-600 font-semibold">
              {user?.email}
            </p>
          </div>
        </div>
      </div>

      {/* Hero Welcome Card */}
      <div className="bg-white rounded-2xl md:rounded-[32px] p-5 md:p-6 border border-rose-100 shadow-[0_4px_20px_rgba(252,104,125,0.06)] relative overflow-hidden">
        <div
          className="absolute top-0 right-0 w-40 h-40 md:w-48 md:h-48 pointer-events-none opacity-20"
          style={{
            background: "radial-gradient(circle,#FC687D,transparent 65%)",
            filter: "blur(40px)",
          }}
        />

        <div className="relative z-10">
          <p className="text-[#FC687D] text-[9px] md:text-[10px] font-normal uppercase tracking-[0.25em] mb-1">
            Welcome back 👋
          </p>
          <h2 className="text-2xl md:text-3xl font-normal text-slate-800 leading-tight mb-1 tracking-tight">
            {member?.customer_name || user?.user_metadata?.full_name || "Coffee Lover"}
          </h2>

          {member?.customer_code && (
            <p className="text-slate-400 text-[10px] md:text-xs font-mono tracking-wider font-normal">
              {member.customer_code}
            </p>
          )}

          {member && (
            <div className="flex gap-4 md:gap-6 mt-4 md:mt-6 bg-[#FFF9FA] p-3 md:p-4 rounded-xl md:rounded-2xl border border-rose-50 inline-flex">
              <div>
                <p className="text-[#FC687D] font-normal text-xl md:text-2xl leading-none">
                  {availablePts.toFixed(0)}
                </p>
                <p className="text-slate-500 text-[9px] md:text-[10px] uppercase font-normal tracking-widest mt-1">
                  Available
                </p>
              </div>
              <div className="w-px bg-rose-100" />
              <div>
                <p className="text-slate-800 font-normal text-xl md:text-2xl leading-none">
                  {totalPts.toFixed(0)}
                </p>
                <p className="text-slate-500 text-[9px] md:text-[10px] uppercase font-normal tracking-widest mt-1">
                  Total
                </p>
              </div>
              <div className="w-px bg-rose-100" />
              <div>
                <p className="text-slate-800 font-normal text-xl md:text-2xl leading-none">
                  {visits.toFixed(0)}
                </p>
                <p className="text-slate-500 text-[9px] md:text-[10px] uppercase font-normal tracking-widest mt-1">
                  Visits
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Action Grid */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        {[
          { icon: "🍽️", label: "Order Food", sub: "Browse menu", tab: "order" },
          { icon: "⭐", label: "Loyalty", sub: "Rewards", tab: "loyalty" },
          { icon: "🗓", label: "Book Room", sub: "Function room", tab: "booking" },
          { icon: "🎁", label: "Promos", sub: "Deals & offers", href: "/promo" },
        ].map((c) =>
          c.href ? (
            <Link
              key={c.label}
              href={c.href}
              className="bg-white rounded-xl md:rounded-[24px] p-4 md:p-5 border border-rose-50 shadow-sm hover:shadow-md active:scale-95 transition-all duration-300"
            >
              <div className="text-2xl md:text-3xl mb-2 md:mb-3 bg-rose-50 w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center">
                {c.icon}
              </div>
              <p className="font-normal text-slate-800 text-[13px] md:text-[15px]">{c.label}</p>
              <p className="text-slate-400 text-[9px] md:text-[11px] font-normal uppercase tracking-widest mt-0.5">
                {c.sub}
              </p>
            </Link>
          ) : (
            <button
              key={c.label}
              onClick={() => setTab(c.tab)}
              className="bg-white rounded-xl md:rounded-[24px] p-4 md:p-5 border border-rose-50 shadow-sm text-left hover:shadow-md active:scale-95 transition-all duration-300"
            >
              <div className="text-2xl md:text-3xl mb-2 md:mb-3 bg-rose-50 w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-[#FC687D]">
                {c.icon}
              </div>
              <p className="font-normal text-slate-800 text-[13px] md:text-[15px]">{c.label}</p>
              <p className="text-slate-400 text-[9px] md:text-[11px] font-normal uppercase tracking-widest mt-0.5">
                {c.sub}
              </p>
            </button>
          )
        )}
      </div>

      {/* Visit Us */}
      <div className="bg-white rounded-xl md:rounded-[24px] p-5 border border-rose-50 shadow-sm">
        <p className="text-[9px] md:text-[10px] font-normal uppercase tracking-widest text-slate-400 mb-3">
          Visit Us
        </p>

        <div className="flex gap-2 mb-4">
          {Object.entries(BRANCHES).map(([key, b]) => (
            <button
              key={key}
              onClick={() => setBranch(key)}
              className={`flex-1 py-2 rounded-xl text-[10px] md:text-[11px] uppercase tracking-widest border transition-all active:scale-95 ${
                branch === key
                  ? "bg-[#FC687D] text-white border-[#FC687D]"
                  : "bg-white text-slate-500 border-slate-200"
              }`}
            >
              {b.buttonLabel}
            </button>
          ))}
        </div>

        <p className="text-[10px] md:text-[11px] font-semibold text-slate-800 uppercase tracking-widest mb-3">
          {active.name}
        </p>

        <div className="space-y-2.5 text-[11px] md:text-[13px] text-slate-600 font-normal">
          <p className="flex gap-3">
            <span>📍</span>
            {active.address}
          </p>
          <p className="flex gap-3">
            <span>📞</span>
            {active.phone}
          </p>

          <p className="flex gap-3 items-start">
            <span>🕙</span>
            <span>
              <span className="font-semibold text-slate-700">{active.hoursLabel}:</span>
              <br />
              {active.hours.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </span>
          </p>

          {active.room.length > 0 && (
            <p className="flex gap-3 items-start">
              <span>🕙</span>
              <span>
                {active.room.map((line) => (
                  <span key={line} className="block text-slate-500">
                    {line}
                  </span>
                ))}
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Customer Order: Add To Cart Modal (Variants + Instructions)
// ==========================================
function AddToCartModal({ item, onClose, onAdd }) {
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState({});
  const [instructions, setInstructions] = useState("");

  useEffect(() => {
    if (!item) return;
    const source = item.editData || item;
    setQuantity(source.quantity || 1);
    setInstructions(source.instructions || "");

    const selected = {};
    if (source.variantDetails && item.variants) {
      source.variantDetails.split(", ").forEach((name) => {
        item.variants.forEach((g) => {
          const match = g.options?.find((o) => o.name === name);
          if (match) {
            selected[g.id] = selected[g.id] || [];
            selected[g.id].push(match);
          }
        });
      });
    }
    setSelections(selected);
  }, [item]);

  if (!item) return null;

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

  const unitPrice = (Number(item.price) || 0) + variantPrice;
  const variantDetails = Object.values(selections)
    .flat()
    .map((o) => o.name)
    .join(", ");

  const canAdd =
    (item.variants || []).every((g) => !g.isRequired || (selections[g.id] || []).length > 0);

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
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Add to Cart</p>
            <h3 className="text-lg md:text-xl font-semibold text-slate-800 mt-1">{item.name}</h3>
            <p className="text-xs text-slate-500 mt-1">
              Base ₱{Number(item.price || 0).toFixed(0)}
              {variantPrice > 0 ? ` • +₱${variantPrice.toFixed(0)} variants` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {Array.isArray(item.variants) && item.variants.length > 0 && (
          <div className="mt-4 space-y-4">
            {item.variants.map((g) => (
              <div key={g.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-700">
                    {g.name} {g.isRequired ? <span className="text-rose-500">*</span> : null}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {g.isMultiSelect ? "Multi-select" : "Single-select"}
                  </p>
                </div>

                <div className="space-y-2">
                  {(g.options || []).map((o) => {
                    const sel = (selections[g.id] || []).find((x) => x.id === o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => toggleOption(g, o)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-sm transition-all ${
                          sel ? "border-rose-300 bg-rose-50/40" : "border-slate-200 bg-white"
                        }`}
                      >
                        <span className="font-medium text-slate-800">{o.name}</span>
                        <span className="text-slate-500 text-xs">
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

        <div className="mt-4">
          <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
            Special Instructions
          </label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Add specific notes..."
            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none h-20 resize-none focus:bg-slate-100/50 transition-all"
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center w-36 h-12 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-12 h-full text-xl text-slate-400 hover:text-rose-500 transition-colors"
            >
              −
            </button>
            <div className="flex-1 text-center font-bold text-slate-800">{quantity}</div>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="w-12 h-full text-xl text-slate-400 hover:text-rose-500 transition-colors"
            >
              +
            </button>
          </div>

          <button
            disabled={!canAdd}
            onClick={() =>
              onAdd({
                id: item.id,
                name: item.name,
                unitPrice,
                quantity,
                variantDetails,
                instructions,
                cartItemId: item.editData?.cartItemId || Date.now(),
              })
            }
            className="flex-1 py-3 rounded-xl text-white text-sm font-semibold shadow-lg transition-all active:scale-[0.98] disabled:opacity-60"
            style={{ backgroundColor: "#FC687D" }}
          >
            {canAdd ? `Add • ₱${(unitPrice * quantity).toFixed(0)}` : "Select required options"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <div
      className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md bg-white rounded-t-[26px] md:rounded-[30px] p-5 md:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] uppercase tracking-widest text-slate-400">Confirmation</p>
        <h3 className="text-lg font-semibold text-slate-800 mt-1">{title}</h3>
        <p className="text-sm text-slate-600 mt-3">{message}</p>

        <div className="grid grid-cols-2 gap-2 mt-5 pt-4 border-t border-slate-100">
          <button
            onClick={onCancel}
            className="w-full py-3 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="w-full py-3 rounded-xl bg-[#FC687D] text-white text-xs font-bold active:scale-95"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Order Tab
────────────────────────────────────────────────────────────── */
function OrderTab({ user }) {
  const [items, setItems] = useState([]);
  const [cats, setCategories] = useState([]);
  const [activeTab, setActiveTab] = useState("ALL");
  const [itemSearch, setItemSearch] = useState("");

  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedItemForModal, setSelectedItemForModal] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    async function fetchMenu() {
      setLoading(true);

      const [itemRes, catRes] = await Promise.all([
        supabase.from("menu_items").select("*").eq("is_available", true).eq("pos_only", false).order("name"),
        supabase.from("menu_categories").select("*").eq("is_active", true).eq("pos_only", false).order("name", { ascending: true }),
      ]);

      const itemsData = itemRes.data || [];
      const catsData = catRes.data || [];

      setItems(itemsData);

      const sortedCats = [...catsData].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setCategories(sortedCats);

      setLoading(false);
    }

    fetchMenu();
  }, []);

  const q = itemSearch.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    return items
      .filter((i) => (activeTab === "ALL" ? true : i.category === activeTab))
      .filter((i) => (q ? (i.name || "").toLowerCase().includes(q) : true));
  }, [items, activeTab, q]);

  const subtotal = useMemo(() => cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0), [cart]);
  const itemCount = useMemo(() => cart.reduce((sum, i) => sum + i.quantity, 0), [cart]);

  const onAddToCart = (line) => {
    setCart((prev) => {
      const editIndex = selectedItemForModal?.editIndex;
      if (editIndex !== undefined && editIndex !== null) {
        const updated = [...prev];
        updated[editIndex] = line;
        return updated;
      }
      return [...prev, line];
    });
    setSelectedItemForModal(null);
  };

  const removeLine = (cartItemId) => setCart((prev) => prev.filter((x) => x.cartItemId !== cartItemId));

  const changeQty = (cartItemId, delta) => {
    setCart((prev) =>
      prev
        .map((x) => (x.cartItemId === cartItemId ? { ...x, quantity: Math.max(1, x.quantity + delta) } : x))
        .filter(Boolean)
    );
  };

  const clearCart = () => {
    setCart([]);
    setConfirmClear(false);
    setCartOpen(false);
  };

  const checkout = async () => {
    alert("Checkout submitted! Connect to your order/payment flow next.");
    setCartOpen(false);
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-rose-50 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Menu</p>
            <p className="text-base font-semibold text-slate-800">Order</p>
          </div>

          <div className="flex gap-2">
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value)}
              className="bg-slate-50 px-3 py-2 rounded-xl text-xs outline-none border border-slate-200"
            >
              <option value="ALL">All Categories</option>
              {cats.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
              <input
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Search items..."
                className="pl-8 pr-3 py-2 bg-slate-50 rounded-xl text-xs outline-none border border-slate-200 w-[160px]"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {filteredItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setSelectedItemForModal(item)}
            className="group relative flex flex-col p-3 bg-white border border-slate-100 rounded-2xl cursor-pointer transition-all text-left hover:-translate-y-[6px] hover:shadow-[0_20px_40px_rgba(252,104,125,0.12)]"
            style={{ transitionTimingFunction: "cubic-bezier(0.25,0.46,0.45,0.94)", transitionDuration: "0.35s" }}
          >
            <div className="w-full h-24 rounded-xl bg-[#FFF9FA] border border-rose-50 flex items-center justify-center overflow-hidden">
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl text-rose-200/50">📷</span>
              )}
            </div>

            <div className="mt-2 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">{item.category || "General"}</p>
              <p className="text-sm font-semibold text-slate-800 leading-tight">{item.name}</p>
              <p className="text-sm font-bold text-slate-700">₱{Number(item.price || 0).toFixed(0)}</p>
            </div>
          </button>
        ))}
      </div>

      {cart.length > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-[88px] left-4 right-4 md:left-auto md:right-6 md:w-[360px] z-40 bg-slate-900 text-white flex items-center justify-between px-5 py-4 rounded-2xl shadow-2xl active:scale-[0.98] transition-all"
        >
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-300">Current Cart</p>
            <p className="text-sm font-semibold">{itemCount} item(s)</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">₱{subtotal.toFixed(0)}</p>
            <p className="text-xs text-slate-300">🛒 View</p>
          </div>
        </button>
      )}

      {cartOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setCartOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-[26px] md:rounded-[30px] p-5 md:p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">Cart</p>
                <h3 className="text-lg font-semibold text-slate-800 mt-1">
                  ₱{subtotal.toFixed(0)} • {itemCount} item(s)
                </h3>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmClear(true)}
                  className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500"
                  title="Clear cart"
                >
                  ✕
                </button>
                <button
                  onClick={() => setCartOpen(false)}
                  className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500"
                  aria-label="Close"
                >
                  ↩
                </button>
              </div>
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-10 text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                Empty cart
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((line, idx) => (
                  <button
                    key={line.cartItemId}
                    onClick={() => {
                      const base = items.find((i) => i.id === line.id) || {};
                      setSelectedItemForModal({ ...base, editData: line, editIndex: idx });
                    }}
                    className="w-full text-left border border-slate-200 rounded-2xl p-3 hover:bg-slate-50/60 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {line.name} <span className="text-slate-400">×{line.quantity}</span>
                        </p>

                        {line.variantDetails ? (
                          <p className="text-[11px] text-slate-500 mt-1">{line.variantDetails}</p>
                        ) : null}

                        {line.instructions ? (
                          <p className="text-[11px] text-slate-400 mt-1">Note: {line.instructions}</p>
                        ) : null}

                        <p className="text-xs text-slate-500 mt-2">
                          ₱{Number(line.unitPrice).toFixed(0)} each • Subtotal ₱
                          {(line.unitPrice * line.quantity).toFixed(0)}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeLine(line.cartItemId);
                          }}
                          className="text-[10px] font-bold uppercase tracking-widest text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-xl active:scale-95"
                        >
                          Remove
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              changeQty(line.cartItemId, -1);
                            }}
                            className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 font-bold active:scale-95"
                          >
                            −
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              changeQty(line.cartItemId, +1);
                            }}
                            className="w-9 h-9 rounded-xl bg-[#FC687D] flex items-center justify-center text-white font-bold active:scale-95"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-5 pt-4 border-t border-slate-100 space-y-2">
              <button
                onClick={checkout}
                disabled={cart.length === 0}
                className="w-full py-3 rounded-xl bg-[#FC687D] text-white text-xs font-bold uppercase tracking-widest active:scale-95 disabled:opacity-60"
              >
                Checkout
              </button>

              <button
                onClick={() => setConfirmClear(true)}
                disabled={cart.length === 0}
                className="w-full py-3 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-widest active:scale-95 disabled:opacity-60"
              >
                Clear Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedItemForModal && (
        <AddToCartModal
          item={selectedItemForModal}
          onClose={() => setSelectedItemForModal(null)}
          onAdd={onAddToCart}
        />
      )}

      {confirmClear && (
        <ConfirmModal
          title="Clear cart?"
          message="This will remove all items from your cart."
          onCancel={() => setConfirmClear(false)}
          onConfirm={clearCart}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   ✅ Loyalty Tab (CLEAN + FIXED)
   - Active / Redeemed / Expired
   - Countdown (updates every minute)
   - Birthday popup (once per voucher id)
   - Safe DB select (retries if column doesn't exist yet)
────────────────────────────────────────────────────────────── */
function LoyaltyTab({ member, setMember, user }) {
  const [mode, setMode] = useState(null); // null | "new" | "existing"
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const [editing, setEditing] = useState(false);
  const [showPerks, setShowPerks] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    customer_name: "",
    Phone: "",
    City: "",
    Note: "",
  });

  // vouchers
  const [voucherRows, setVoucherRows] = useState([]);
  const [vouchersActive, setVouchersActive] = useState([]);
  const [vouchersRedeemed, setVouchersRedeemed] = useState([]);
  const [vouchersExpired, setVouchersExpired] = useState([]);
  const [voucherView, setVoucherView] = useState("active");
  const [loadingVouchers, setLoadingVouchers] = useState(false);

  // countdown tick
  const [nowTick, setNowTick] = useState(Date.now());

  // birthday popup
  const [birthdayPopupOpen, setBirthdayPopupOpen] = useState(false);
  const [birthdayVoucher, setBirthdayVoucher] = useState(null);

  // link request status
  const [linkReq, setLinkReq] = useState(null);
  const [loadingLinkReq, setLoadingLinkReq] = useState(false);

  // match preview
  const [checkingMatch, setCheckingMatch] = useState(false);
  const [matchChecked, setMatchChecked] = useState(false);
  const [matchedPreview, setMatchedPreview] = useState(null);

  const total = Number(member?.["Points balance"] || 0);
  const available = Number(member?.["Available points"] || 0);
  const progress = ((available % 100) / 100) * 100;
  const nextReward = (Math.floor(available / 100) + 1) * 100;

  // tick every minute for countdown refresh
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // birthday detector: prefer reward_type; fallback to code/text
  const isBirthdayVoucher = (v) => {
    const rt = String(v?.reward_text || "").toLowerCase();
    const code = String(v?.code || "").toUpperCase();
    if (v?.reward_type) return v.reward_type === "birthday";
    return rt.includes("birthday") || code.startsWith("BDAY");
  };

    useEffect(() => {
      async function createBirthdayVoucherIfNeeded() {
        if (!member?.id || !member?.Note) return;

        const today = new Date();
        const todayStr = today.toISOString().slice(5, 10); // MM-DD

        const birth = member.Note; // YYYY-MMM-DD
        const [, mon, day] = birth.split("-");
        
        const monthIndex = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(mon);
        if (monthIndex === -1) return;

        const bdayFormatted = `${String(monthIndex + 1).padStart(2, "0")}-${day}`;

        if (bdayFormatted !== todayStr) return;

        // ✅ check if already issued this year
        const year = today.getFullYear();

        const { data: existing } = await supabase
          .from("vouchers")
          .select("id")
          .eq("member_id", member.id);

        const alreadyHas = (existing || []).some(v => v.code?.startsWith(`BDAY${year}`));
        if (alreadyHas) return;

        // ✅ create birthday voucher
        await supabase.from("vouchers").insert({
          member_id: member.id,
          code: `BDAY${year}-${Math.floor(Math.random()*10000)}`,
          reward_text: "FREE 16oz Drink or Waffle (Birthday Reward)",
          issued_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), // 7 days
          status: "active",
          reward_type: "birthday",
        });
      }

      createBirthdayVoucherIfNeeded();
    }, [member]);

  // status calculator: respect DB status first; then time-based expiry
  const computeStatus = (v) => {
    if (!v) return "active";

    if (String(v.status).toLowerCase() === "redeemed") return "redeemed";
    if (String(v.status).toLowerCase() === "expired") return "expired";
    if (String(v.status).toLowerCase() === "active") {
      const expMs = v.expires_at ? new Date(v.expires_at).getTime() : 0;
      if (expMs && expMs <= nowTick) return "expired";
      return "active";
    }

    // fallback when status missing
    const expMs = v.expires_at ? new Date(v.expires_at).getTime() : 0;
    if (v.redeemed_at) return "redeemed";
    if (expMs && expMs <= nowTick) return "expired";
    return "active";
  };

  const manilaDateKey = (d) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

const expiryCountdownDetailed = (expires_at) => {
  if (!expires_at) return { text: "—", expiresTonight: false, expired: false };

  const exp = new Date(expires_at);
  const ms = exp.getTime() - nowTick;

  if (ms <= 0) return { text: "Expired", expiresTonight: false, expired: true };

  const days = Math.floor(ms / 86400000);
  const hrs = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);

  const text =
    days > 0
      ? `Expires in ${days}d ${hrs}h ${mins}m`
      : `Expires in ${hrs}h ${mins}m`;

  const expiresTonight =
    manilaDateKey(new Date()) === manilaDateKey(exp); // Manila date match

  return { text, expiresTonight, expired: false };
  };

  const statusPill = (s) => {
    if (s === "active") return "bg-green-50 text-green-700 border-green-200";
    if (s === "redeemed") return "bg-blue-50 text-blue-700 border-blue-200";
    return "bg-slate-50 text-slate-600 border-slate-200";
  };

  // latest link request
  useEffect(() => {
    async function fetchLatestReq() {
      if (!user?.id) return;
      setLoadingLinkReq(true);

      const { data, error } = await supabase
        .from("loyalty_link_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error) setLinkReq(data || null);

      setLoadingLinkReq(false);
    }

    fetchLatestReq();
  }, [user?.id]);

  // fetch vouchers (safe select: retry if some columns don't exist yet)
  useEffect(() => {
    async function fetchVouchers() {
      if (!member?.id) return;
      setLoadingVouchers(true);

      const selectFull =
        "id, code, reward_text, issued_at, expires_at, status, member_id, reward_index, reward_type, redeemed_at";
      const selectFallback =
        "id, code, reward_text, issued_at, expires_at, status, member_id, reward_index";

      let res = await supabase
        .from("vouchers")
        .select(selectFull)
        .eq("member_id", member.id)
        .order("issued_at", { ascending: false });

      // retry if columns don't exist
      if (res.error && /reward_type|redeemed_at/i.test(res.error.message || "")) {
        res = await supabase
          .from("vouchers")
          .select(selectFallback)
          .eq("member_id", member.id)
          .order("issued_at", { ascending: false });
      }

      setVoucherRows(!res.error && res.data ? res.data : []);
      setLoadingVouchers(false);
    }

    fetchVouchers();
  }, [member?.id]);

  // bucketize vouchers whenever data/tick changes
  useEffect(() => {
    const normalized = (voucherRows || []).map((v) => {
      const s = computeStatus(v);
      return { ...v, _computedStatus: s, _isBirthday: isBirthdayVoucher(v) };
    });

    const active = normalized.filter((v) => v._computedStatus === "active");
    const redeemed = normalized.filter((v) => v._computedStatus === "redeemed");
    const expired = normalized.filter((v) => v._computedStatus === "expired");

    setVouchersActive(active);
    setVouchersRedeemed(redeemed);
    setVouchersExpired(expired);

    const activeBirthday = active.find((v) => v._isBirthday) || null;
    setBirthdayVoucher(activeBirthday);
  }, [voucherRows, nowTick]);

  // auto show birthday popup once per voucher id
  useEffect(() => {
    if (!birthdayVoucher?.id) return;
    const key = `juja_bday_popup_${birthdayVoucher.id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {}
    setBirthdayPopupOpen(true);
  }, [birthdayVoucher?.id]);

  // Create member
  const createMember = async () => {
    if (!user?.id) return;

    const b = normalizeBirthday(form.Note);
    if (!b.ok) {
      setNotice("⚠️ " + b.msg);
      return;
    }

    if (!form.customer_name || !form.City || !form.Phone) {
      setNotice("⚠️ Please complete all fields.");
      return;
    }

    setLoading(true);
    setNotice("");

    try {
      const payload = {
        user_id: user.id,
        "Customer ID": genCustomerId(),
        customer_name: form.customer_name,
        Email: user.email ?? null,
        Phone: form.Phone || null,
        City: form.City || null,
        customer_code: genMemberCode(),
        "Points balance": 0,
        "Available points": 0,
        Note: b.value,
        "First visit": todayISO(),
        "Last visit": todayISO(),
        "Total visits": 0,
        "Total spent": 0,
      };

      const { data, error } = await supabase
        .from("loyalty_members")
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      setMember(data);
      setNotice("✅ Account created!");
      setMode(null);
    } catch (err) {
      setNotice("❌ " + (err?.message || "Unable to create account"));
    } finally {
      setLoading(false);
    }
  };

  // Match preview
  const checkMatchPreview = async () => {
    setNotice("");
    setMatchedPreview(null);
    setMatchChecked(false);

    if (!form.customer_name || !form.Note) {
      setNotice("⚠️ Enter your full name and birthday first.");
      return;
    }

    const b = normalizeBirthday(form.Note);
    if (!b.ok) {
      setNotice("⚠️ " + b.msg);
      return;
    }

    setForm((f) => ({ ...f, Note: b.value }));
    setCheckingMatch(true);

    try {
      const { data, error } = await supabase
        .from("loyalty_members")
        .select('id, customer_name, customer_code, Phone, City, Note, "Points balance", "Available points"')
        .ilike("customer_name", form.customer_name)
        .eq("Note", b.value)
        .maybeSingle();

      if (error) throw error;

      setMatchedPreview(data || null);
      setMatchChecked(true);
    } catch (err) {
      setNotice("❌ Match check failed: " + (err?.message || "Unknown error"));
    } finally {
      setCheckingMatch(false);
    }
  };

  // Send request
  const requestLink = async () => {
    if (!user?.id) return;

    if (linkReq?.status === "pending") {
      setNotice("⚠️ You already have a pending request. Please wait for approval.");
      return;
    }

    if (!form.customer_name || !form.Note) {
      setNotice("⚠️ Please enter your full name and birthday.");
      return;
    }

    const b = normalizeBirthday(form.Note);
    if (!b.ok) {
      setNotice("⚠️ " + b.msg);
      return;
    }

    if (!matchChecked) {
      setNotice("⚠️ Please tap “Check Match” first to review the matched account.");
      return;
    }

    setLoading(true);
    setNotice("");

    try {
      const matchedId = matchedPreview?.id || null;

      const { data: inserted, error } = await supabase
        .from("loyalty_link_requests")
        .insert({
          user_id: user.id,
          input_name: form.customer_name,
          input_birthday: b.value,
          matched_member_id: matchedId,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;

      setLinkReq(inserted);
      setNotice("✅ Request submitted! Please wait for admin approval.");
    } catch (err) {
      setNotice("❌ " + (err?.message || "Request failed"));
    } finally {
      setLoading(false);
    }
  };

  const startEdit = () => {
    setForm({
      customer_name: member?.customer_name || "",
      Phone: member?.["Phone"] || "",
      City: member?.["City"] || "",
      Note: member?.["Note"] || "",
    });
    setEditing(true);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!member?.id) return;

    const b = normalizeBirthday(form.Note);
    if (!b.ok) {
      setNotice("⚠️ " + b.msg);
      return;
    }

    setSaving(true);
    setNotice("");

    try {
      const updateData = {
        customer_name: form.customer_name,
        Phone: form.Phone,
        City: form.City,
        Note: b.value,
      };

      const { data, error } = await supabase
        .from("loyalty_members")
        .update(updateData)
        .eq("id", member.id)
        .select()
        .single();

      if (error) throw error;

      setMember(data);
      setEditing(false);
      setNotice("✅ Profile updated.");
    } catch (err) {
      setNotice("❌ " + (err?.message || "Update failed"));
    } finally {
      setSaving(false);
    }
  };

  const StatusCard = () => {
    if (loadingLinkReq) {
      return (
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-500">
          Checking link request status…
        </div>
      );
    }
    if (!linkReq) return null;

    const s = linkReq.status;

    return (
      <div className="bg-white border border-rose-100 rounded-xl p-4 text-sm">
        <p className="font-semibold text-slate-800">Link Request Status</p>
        <p className="mt-1 text-slate-600">
          {s === "pending" && <span className="text-yellow-600">⏳ Pending approval</span>}
          {s === "approved" && linkReq.approved_at && (
            <span className="text-green-600">
              ✅ Approved on {new Date(linkReq.approved_at).toLocaleString()}
            </span>
          )}
          {s === "rejected" && linkReq.rejected_at && (
            <span className="text-red-600">
              ❌ Rejected on {new Date(linkReq.rejected_at).toLocaleString()}
            </span>
          )}
          {!["pending", "approved", "rejected"].includes(s) && <span>{String(s)}</span>}
        </p>
        <p className="mt-2 text-[11px] text-slate-400">Submitted: {fmtDate(linkReq.created_at)}</p>
      </div>
    );
  };

  // ENTRY UI
  if (!member && !mode) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <StatusCard />

        <div className="bg-gradient-to-br from-[#FFF9FA] to-rose-50 border border-rose-100 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800">⭐ Juja Rewards</h2>
          <p className="text-sm text-slate-500 mt-1">
            Earn points and enjoy exclusive rewards every time you visit.
          </p>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span>🎯</span>
              <span>100 points = FREE drink or waffle</span>
            </div>
            <div className="flex items-center gap-2">
              <span>🎂</span>
              <span>Birthday reward (free drink)</span>
            </div>
            <div className="flex items-center gap-2">
              <span>⚡</span>
              <span>Earn points instantly on every purchase</span>
            </div>
          </div>

          <div className="mt-4 text-xs text-slate-400">💡 1 point for every ₱25 spent</div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => {
              setMode("new");
              setNotice("");
            }}
            className="w-full py-3 bg-[#FC687D] text-white rounded-2xl font-semibold text-sm shadow-sm active:scale-95"
          >
            ⭐ Sign Up
          </button>

          <button
            onClick={() => {
              setMode("existing");
              setNotice("");
              setMatchChecked(false);
              setMatchedPreview(null);
            }}
            className="w-full py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl font-semibold text-sm active:scale-95"
          >
            🔗 Link Existing Account
          </button>
        </div>

        {notice && (
          <div className="bg-white border border-rose-100 rounded-xl p-3 text-sm text-slate-600">
            {notice}
          </div>
        )}
      </div>
    );
  }

  // SIGN UP FORM
  if (!member && mode === "new") {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Sign Up</h2>
          <p className="text-sm text-slate-500 mt-1">Create your Juja Rewards membership.</p>
        </div>

        <div className="space-y-3">
          <input
            placeholder="Full Name"
            value={form.customer_name}
            onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm"
          />
          <input
            placeholder="City"
            value={form.City}
            onChange={(e) => setForm((f) => ({ ...f, City: e.target.value }))}
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm"
          />
          <input
            placeholder="Contact Number"
            value={form.Phone}
            onChange={(e) => setForm((f) => ({ ...f, Phone: e.target.value }))}
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm"
          />
          <input
            placeholder="Birthday (YYYY-MMM-DD) e.g. 1995-Dec-25"
            value={form.Note}
            onChange={(e) => setForm((f) => ({ ...f, Note: e.target.value }))}
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setMode(null)}
            className="flex-1 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold"
            disabled={loading}
          >
            Back
          </button>
          <button
            onClick={createMember}
            className="flex-1 py-3 rounded-xl bg-[#FC687D] text-white text-xs font-bold disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Creating..." : "Create Account"}
          </button>
        </div>

        {notice && (
          <div className="bg-white border border-rose-100 rounded-xl p-3 text-sm text-slate-600">
            {notice}
          </div>
        )}
      </div>
    );
  }

  // EXISTING LINK FORM
  if (!member && mode === "existing") {
    const pendingBlock = linkReq?.status === "pending";

    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <StatusCard />

        <div>
          <h2 className="text-xl font-semibold text-slate-800">Link Existing Account</h2>
          <p className="text-sm text-slate-500 mt-1">
            Enter your full name and birthday (YYYY-MMM-DD). We’ll show the matched account for confirmation before sending.
          </p>
        </div>

        <div className="space-y-3">
          <input
            placeholder="Full Name"
            value={form.customer_name}
            onChange={(e) => {
              setForm((f) => ({ ...f, customer_name: e.target.value }));
              setMatchChecked(false);
              setMatchedPreview(null);
            }}
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm"
            disabled={pendingBlock}
          />
          <input
            placeholder="Birthday (YYYY-MMM-DD) e.g. 1995-Dec-25"
            value={form.Note}
            onChange={(e) => {
              setForm((f) => ({ ...f, Note: e.target.value }));
              setMatchChecked(false);
              setMatchedPreview(null);
            }}
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm"
            disabled={pendingBlock}
          />

          <button
            onClick={checkMatchPreview}
            disabled={pendingBlock || checkingMatch}
            className="w-full py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold active:scale-95 disabled:opacity-60"
          >
            {checkingMatch ? "Checking…" : "Check Match"}
          </button>
        </div>

        {matchChecked && (
          <div className="rounded-2xl border p-4 bg-white">
            {matchedPreview ? (
              <>
                <p className="text-sm font-semibold text-slate-800">Match Found ✅</p>
                <p className="text-xs text-slate-500 mt-1">
                  Please confirm this is your loyalty account before sending the request.
                </p>

                <div className="mt-3 bg-[#FFF9FA] border border-rose-100 rounded-xl p-3">
                  <div className="font-semibold text-slate-800">
                    {matchedPreview.customer_name} •{" "}
                    <span className="font-mono">{matchedPreview.customer_code}</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Phone: <span className="font-mono">{matchedPreview.Phone || "—"}</span> • City:{" "}
                    <span className="font-mono">{matchedPreview.City || "—"}</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Birthday: <span className="font-mono">{matchedPreview.Note || "—"}</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Total: <span className="font-mono">{matchedPreview["Points balance"] ?? "0"}</span> • Available:{" "}
                    <span className="font-mono">{matchedPreview["Available points"] ?? "0"}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-800">No match found</p>
                <p className="text-xs text-slate-500 mt-1">
                  You can still send a request—admin will review and link manually.
                </p>
              </>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setMode(null)}
            className="flex-1 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold"
            disabled={loading}
          >
            Back
          </button>

          <button
            onClick={requestLink}
            className="flex-1 py-3 rounded-xl bg-[#FC687D] text-white text-xs font-bold disabled:opacity-60"
            disabled={loading || pendingBlock}
          >
            {pendingBlock ? "Pending…" : loading ? "Submitting..." : "Send Request"}
          </button>
        </div>

        {pendingBlock && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-700">
            You already have a pending request. You can’t submit another until it’s approved/rejected.
          </div>
        )}

        {notice && (
          <div className="bg-white border border-rose-100 rounded-xl p-3 text-sm text-slate-600">
            {notice}
          </div>
        )}
      </div>
    );
  }

  // MEMBER DASHBOARD
  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl md:text-[28px] font-normal text-slate-800 tracking-tight">
          JUJA Loyalty Program
        </h2>
        <p className="text-slate-500 text-xs md:text-sm mt-0.5 font-normal">Member Dashboard</p>
      </div>

      <div className="relative w-full max-w-[600px] aspect-[16/9] rounded-3xl overflow-hidden shadow-2xl bg-white">
        <img
          src="/images/loyalty-card-bg.jpg"
          alt="Loyalty Card Background"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="relative z-10 h-full w-full flex flex-col p-[5%]">
          <div className="flex items-end justify-between w-full h-[50%] mt-[10px]">
            <div className="w-[70%] bg-white flex flex-col items-center justify-center rounded-lg shadow-sm p-2 relative top-[90px]">
              <Barcode
                value={member?.customer_code || "JUJA000000"}
                background="transparent"
                lineColor="#003399"
                width={1.4}
                height={70}
                displayValue
                fontSize={14}
                margin={0}
              />
            </div>
            <div className="w-[58%] h-full pointer-events-none" />
          </div>
        </div>
      </div>

      <div
        className="rounded-2xl md:rounded-[32px] overflow-hidden shadow-[0_10px_30px_rgba(252,104,125,0.2)]"
        style={{ background: "linear-gradient(135deg, #FC687D 0%, #f43f5e 100%)" }}
      >
        <div className="px-5 py-5 md:px-6 md:py-7 uppercase text-center border-b border-white/20 relative">
          <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-white/10 rounded-full blur-2xl" />
          <h3 className="text-xl md:text-2xl font-normal text-white tracking-tight">
            {member?.customer_name || "Juja Member"}
          </h3>
        </div>

        <div className="px-5 py-5 md:px-6 md:py-6 space-y-3 border-b border-white/20 bg-black/5">
          {[
            { icon: "📞", value: member?.["Phone"] || "—" },
            { icon: "📍", value: member?.["City"] || "—" },
            { icon: "▦", value: member?.customer_code || "—" },
            { icon: "🎂", value: member?.["Note"] || "—" },
          ].map((row) => (
            <div key={row.icon} className="flex items-center gap-3">
              <span className="text-lg text-white/60 w-6 text-center">{row.icon}</span>
              <span className="text-white text-[13px] md:text-[15px] font-semibold truncate">
                {row.value}
              </span>
            </div>
          ))}
        </div>

        <div className="px-5 py-5 md:px-6 md:py-6 flex justify-between items-center bg-black/10">
          <div className="flex gap-1.5">
            <button
              onClick={startEdit}
              className="text-[9px] md:text-[11px] leading-none font-normal uppercase tracking-[0.14em] text-white/85 hover:text-white transition-all bg-white/10 px-4 py-2 md:px-5 md:py-2.5 rounded-full border border-white/20 active:scale-95"
            >
              Edit Profile
            </button>

            <button
              onClick={() => setShowPerks(true)}
              className="text-[9px] md:text-[11px] leading-none font-normal uppercase tracking-[0.14em] text-white hover:text-white transition-all bg-white/20 px-4 py-2 md:px-5 md:py-2.5 rounded-full border border-white/20 active:scale-95"
            >
              View Perks
            </button>
          </div>

          <div className="text-right">
            <p className="text-white/80 text-[9px] md:text-[10px] uppercase tracking-widest mb-1">
              Points
            </p>
            <p className="text-[12px] text-white/85">Total: {total.toFixed(0)}</p>
            <p className="text-2xl md:text-3xl font-normal text-white">{available.toFixed(0)}</p>
            <p className="text-[10px] text-white/80 uppercase tracking-widest">Available</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl md:rounded-[24px] p-5 md:p-6 border border-rose-50 shadow-sm">
        <div className="flex justify-between items-end mb-3">
          <p className="font-normal text-slate-800 text-[13px] md:text-[15px]">Points Progress</p>
          <p className="text-[10px] md:text-xs font-normal text-slate-400">
            {available.toFixed(0)} / {nextReward} pts (Available)
          </p>
        </div>

        <div className="w-full h-2.5 md:h-3 bg-slate-100 rounded-full overflow-hidden mb-3 border border-slate-200">
          <div className="h-full rounded-full bg-[#FC687D]" style={{ width: `${progress}%` }} />
        </div>

        <p className="text-[10px] md:text-[11px] font-normal text-slate-500">
          {(nextReward - available).toFixed(0)} more available points until your next reward 🎁
        </p>
      </div>

      {/* Vouchers */}
      <div className="bg-white rounded-xl md:rounded-[24px] p-5 md:p-6 border border-rose-50 shadow-sm">
        <div className="flex items-end justify-between mb-3">
          <p className="font-normal text-slate-800 text-[13px] md:text-[15px]">Your Vouchers</p>
          <p className="text-[10px] md:text-xs font-normal text-slate-400">
            {loadingVouchers
              ? "Loading…"
              : `${vouchersActive.length} active • ${vouchersRedeemed.length} redeemed • ${vouchersExpired.length} expired`}
          </p>
        </div>

        <div className="flex gap-2 mb-4">
          {[
            { id: "active", label: `Active (${vouchersActive.length})` },
            { id: "redeemed", label: `Redeemed (${vouchersRedeemed.length})` },
            { id: "expired", label: `Expired (${vouchersExpired.length})` },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setVoucherView(t.id)}
              className={`px-3 py-2 rounded-xl text-[10px] uppercase tracking-widest border transition-all active:scale-95 ${
                voucherView === t.id
                  ? "bg-[#FC687D] text-white border-[#FC687D]"
                  : "bg-white text-slate-500 border-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loadingVouchers ? (
          <p className="text-[11px] md:text-[12px] text-slate-500">Loading vouchers…</p>
        ) : (
          <>
            {(() => {
              const list =
                voucherView === "active"
                  ? vouchersActive
                  : voucherView === "redeemed"
                  ? vouchersRedeemed
                  : vouchersExpired;

              if (!list || list.length === 0) {
                return (
                  <p className="text-[11px] md:text-[12px] text-slate-500">
                    {voucherView === "active"
                      ? "No active vouchers right now."
                      : voucherView === "redeemed"
                      ? "No redeemed vouchers yet."
                      : "No expired vouchers yet."}
                  </p>
                );
              }

              return (
                <div className="space-y-3">
                  {list.map((v) => {
                    const s = v._computedStatus || String(v.status || "active").toLowerCase();
                    const countdown = s === "active" ? expiryCountdownDetailed(v.expires_at) : null;``

                    return (
                      <div
                        key={v.id}
                        className={`border rounded-2xl p-4 ${
                          v._isBirthday
                            ? "border-rose-200 bg-rose-50/40"
                            : s === "active"
                            ? "border-rose-100 bg-[#FFF9FA]"
                            : s === "redeemed"
                            ? "border-blue-100 bg-blue-50/30"
                            : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-[12px] md:text-[13px] font-semibold text-slate-800">
                                {v._isBirthday ? "🎂 Birthday Voucher" : "🎁 Reward Voucher"}
                              </p>

                              <span
                                className={`text-[9px] uppercase tracking-widest border px-2 py-1 rounded-full ${statusPill(
                                  s
                                )}`}
                              >
                                {s}
                              </span>
                            </div>

                            <p className="text-[11px] md:text-[12px] text-slate-600 mt-1 leading-relaxed">
                              {v.reward_text}
                            </p>

                            <p className="text-[10px] md:text-[11px] text-slate-400 mt-2 font-mono">
                              Code: {v.code}
                            </p>

                            {(() => {
                                if (s !== "active") return null;
                                const c = expiryCountdownDetailed(v.expires_at);                                                              
                                  {countdown && (
                                    <div className="mt-2 space-y-1">
                                      <p className="text-[11px] md:text-[12px] font-semibold text-[#FC687D]">
                                        ⏳ {countdown.text}
                                      </p>

                                      {countdown.expiresTonight && (
                                        <p className="text-[11px] md:text-[12px] font-semibold text-orange-600">
                                          ⚠️ Expires tonight
                                        </p>
                                    )}
                                  </div>
                                )}
                              })()}                            
                          </div>

                          <div className="text-right">
                            <p className="text-[10px] md:text-[11px] text-slate-400">
                              {s === "redeemed" ? "Redeemed" : "Expires"}
                            </p>

                            <p className="text-[11px] md:text-[12px] font-semibold text-slate-800">
                              {s === "redeemed" ? fmtDate(v.redeemed_at) : fmtDate(v.expires_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* Birthday Popup */}
      {birthdayPopupOpen && birthdayVoucher && (
        <div
          className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setBirthdayPopupOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-[26px] md:rounded-[30px] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">
                  Birthday Reward 🎉
                </p>
                <h3 className="text-xl font-semibold text-slate-800 mt-1">
                  Happy Birthday! 🎂✨
                </h3>
                <p className="text-sm text-slate-600 mt-2">
                  Your birthday voucher is now active:
                </p>

                <div className="mt-3 bg-rose-50 border border-rose-200 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-slate-800">
                    {birthdayVoucher.reward_text}
                  </p>
                  <p className="text-xs text-slate-500 mt-2 font-mono">
                    Code: {birthdayVoucher.code}
                  </p>
                  <p className="text-sm font-semibold text-[#FC687D] mt-2">
                    ⏳ {expiryCountdown(birthdayVoucher.expires_at)}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setBirthdayPopupOpen(false)}
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <button
              onClick={() => setBirthdayPopupOpen(false)}
              className="w-full mt-5 py-3 rounded-xl bg-[#FC687D] text-white text-xs font-bold uppercase tracking-widest active:scale-95"
            >
              Awesome!
            </button>
          </div>
        </div>
      )}

      {/* Edit Modal + Perks Modal + notice (kept same as your original flow) */}
      {editing && (
        <div
          className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setEditing(false)}
        >
          <div
            className="w-full max-w-md mx-auto bg-white rounded-t-[24px] md:rounded-[32px] p-5 md:p-8 pb-8 md:pb-12 max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl md:text-2xl font-normal text-slate-800 tracking-tight">
                Edit Profile
              </h3>
              <button
                onClick={() => setEditing(false)}
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={saveEdit} className="space-y-4">
              {[
                ["customer_name", "Full Name", "text", "Your full name"],
                ["Phone", "Phone Number", "tel", "09XX XXX XXXX"],
                ["City", "City", "text", "e.g. QC"],
                ["Note", "Birthday (YYYY-MMM-DD)", "text", "1995-Dec-25"],
              ].map(([key, lbl, type, ph]) => (
                <div key={key}>
                  <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1.5 ml-1">
                    {lbl}
                  </label>
                  <input
                    type={type}
                    value={form[key] ?? ""}
                    placeholder={ph}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs md:text-sm font-semibold text-slate-800 focus:outline-none focus:border-[#FC687D] focus:bg-white focus:ring-1 focus:ring-rose-100 transition-all"
                  />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="w-full py-3 rounded-xl bg-white border border-slate-200 text-slate-500 uppercase tracking-widest text-[10px] hover:bg-slate-50 active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-3 rounded-xl bg-[#FC687D] text-white uppercase tracking-widest text-[10px] hover:bg-rose-500 active:scale-95 disabled:opacity-70"
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPerks && (
        <div
          className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setShowPerks(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-white rounded-t-[28px] md:rounded-[32px] p-6 md:p-8 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl md:text-2xl font-normal text-slate-800">Perks</h3>
              <button
                onClick={() => setShowPerks(false)}
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Keep your perks content */}
            <div className="space-y-5 text-slate-700">
              <div className="text-center">
                <p className="text-[13px] md:text-[14px] font-semibold text-slate-900">
                  🎉 LOYALTY PROGRAM 🎉
                </p>
              </div>

              <section className="bg-slate-50 border border-slate-200 rounded-2xl p-4 md:p-5">
                <h4 className="text-[10px] md:text-[11px] font-semibold text-slate-800 uppercase tracking-widest">
                  Registration
                </h4>
                <ul className="mt-3 space-y-2 text-[12px] md:text-[13px] leading-relaxed">
                  <li>✅ FREE to join — no fees, no hidden charges.</li>
                  <li>Sign up in-store and get your JUJA Loyalty Card instantly.</li>
                </ul>
              </section>

              <section className="bg-slate-50 border border-slate-200 rounded-2xl p-4 md:p-5">
                <h4 className="text-[10px] md:text-[11px] font-semibold text-slate-800 uppercase tracking-widest">
                  Earning Points
                </h4>
                <ul className="mt-3 space-y-2 text-[12px] md:text-[13px] leading-relaxed">
                  <li>💙 Earn 1 JUJA Point for every ₱25 spent on food & drinks.</li>
                  <li>📲 Present your loyalty card for scanning during purchase.</li>
                  <li>⏱ Points are credited immediately after purchase.</li>
                </ul>
              </section>

              <section className="bg-slate-50 border border-slate-200 rounded-2xl p-4 md:p-5">
                <h4 className="text-[10px] md:text-[11px] font-semibold text-slate-800 uppercase tracking-widest">
                  Redeeming Rewards
                </h4>
                <ul className="mt-3 space-y-2 text-[12px] md:text-[13px] leading-relaxed">
                  <li>🎯 <b>100 Points</b> = FREE reward — choose any 16oz drink, waffle, or mini donuts</li>
                  <li>🎂 <b>Birthday Perk:</b> Get any 16oz drink or waffle FREE on your birthday (just present a valid ID).</li>
                  <li>⏳ Rewards expire 90 days after reaching 100 points.</li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div className="bg-white border border-rose-100 rounded-xl p-3 text-sm text-slate-600">
          {notice}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Profile Tab
────────────────────────────────────────────────────────────── */
function ProfileTab({ user, onLogout }) {
  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
      <div className="bg-white rounded-2xl md:rounded-[32px] border border-rose-50 shadow-sm p-5 md:p-6">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-rose-50 flex items-center justify-center text-2xl md:text-3xl">
            👤
          </div>
          <div>
            <p className="font-normal text-slate-800 text-base md:text-lg">{user?.email}</p>
            <p className="text-slate-400 text-[9px] md:text-[10px] font-normal uppercase tracking-widest">
              Juja Member
            </p>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="w-full py-3.5 rounded-xl bg-slate-50 text-slate-500 font-normal text-[10px] md:text-[11px] uppercase tracking-widest hover:bg-rose-50 hover:text-[#FC687D] active:scale-95 transition-all"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Main Customer Page
────────────────────────────────────────────────────────────── */
export default function Customer() {
  const [user, setUser] = useState(null);
  const [member, setMember] = useState(null);
  const [tab, setTab] = useState("home");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function loadData() {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;

      if (!session) {
        router.push("/login");
        return;
      }

      setUser(session.user);

      try {
        const { data: mData } = await supabase
          .from("loyalty_members")
          .select("*")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (mData) setMember(mData);
      } catch (e) {
        console.warn("No member profile", e);
      }

      setLoading(false);
    }

    loadData();
  }, [router]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("loyalty-live-update")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "loyalty_members" },
        (payload) => {
          if (payload?.new?.user_id === user.id) setMember(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7]">
        <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
      </div>
    );
  }

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen pb-24 pt-4 md:pt-6 bg-[#FFF5F7]">
      <main className="max-w-md mx-auto px-4 md:px-5 py-4">
        {tab === "home" && <HomeTab member={member} user={user} setTab={setTab} />}
        {tab === "order" && <OrderTab user={user} />}
        {tab === "loyalty" && <LoyaltyTab member={member} setMember={setMember} user={user} />}
        {tab === "booking" && <BookingTab user={user} member={member} />}
        {tab === "profile" && <ProfileTab user={user} onLogout={logout} />}
      </main>

      <TabBar tab={tab} setTab={setTab} />
    </div>
  );
}