"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
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
    Responsive Sidebar / Bottom Tab Navigation
────────────────────────────────────────────────────────────── */
function AppNavigation({ tab, setTab }) {
  const tabs = [
    { id: "home", icon: "🏠", label: "Home" },
    { id: "order", icon: "🍽️", label: "Order" },
    { id: "loyalty", icon: "⭐", label: "Loyalty" },
    { id: "booking", icon: "🗓", label: "Book" },
    { id: "profile", icon: "👤", label: "Profile" },
  ];

  return (
    <>
      {/* Mobile & Tablet Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-rose-50 pb-safe shadow-[0_-4px_24px_rgba(252,104,125,0.05)] lg:hidden">
        <div className="max-w-xl mx-auto grid grid-cols-5 px-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex flex-col items-center justify-center py-3 gap-1 transition-all duration-300 active:scale-90 ${
                tab === t.id ? "text-[#FC687D]" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <span className={`text-[22px] leading-none transition-transform duration-300 ${tab === t.id ? "scale-110 -translate-y-0.5" : ""}`}>
                {t.icon}
              </span>
              <span className={`text-[9px] font-medium uppercase tracking-widest ${tab === t.id ? "text-[#FC687D]" : "text-slate-400"}`}>
                {t.label}
              </span>
              {tab === t.id && (
                <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-[#FC687D]" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Desktop Persistent Left Sidebar Layout */}
      <aside className="hidden lg:flex flex-col fixed top-0 left-0 h-screen w-64 bg-white border-r border-rose-50 p-6 z-50">
        <div className="flex items-center gap-3 mb-8 px-2">
          <img src={LOGO} alt="Juja Logo" className="h-10 w-auto object-contain" />
          <div className="leading-tight">
            <h1 className="text-xs font-bold uppercase tracking-widest text-[#FC687D]">Juja</h1>
            <p className="text-[10px] uppercase text-slate-400 tracking-wider">Brew & Bites</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-200 ${
                tab === t.id
                  ? "bg-[#FFF5F7] text-[#FC687D]"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span className="text-xl leading-none">{t.icon}</span>
              <span className="tracking-wide">{t.label}</span>
            </button>
          ))}
        </nav>
      </aside>
    </>
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
    <div className="space-y-6 lg:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Brand Header block */}
      <div className="flex items-center justify-between bg-white rounded-2xl p-4 border border-rose-50 shadow-sm lg:hidden">
        <div className="flex items-center gap-3">
          <Link href="/" className="active:scale-95 transition">
            <img src={LOGO} alt="Juja" className="h-9 w-auto object-contain" />
          </Link>
          <div className="leading-tight">
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Juja Brew & Bites</p>
            <p className="text-xs text-slate-600 font-semibold truncate max-w-[200px]">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Main Responsive Layout Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Welcome & Balance Core Cards */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl md:rounded-[32px] p-6 border border-rose-100 shadow-[0_4px_20px_rgba(252,104,125,0.04)] relative overflow-hidden h-full flex flex-col justify-between">
            <div
              className="absolute top-0 right-0 w-64 h-64 pointer-events-none opacity-20"
              style={{
                background: "radial-gradient(circle,#FC687D,transparent 65%)",
                filter: "blur(50px)",
              }}
            />
            <div className="relative z-10">
              <p className="text-[#FC687D] text-[10px] font-semibold uppercase tracking-[0.25em] mb-1">
                Welcome back 👋
              </p>
              <h2 className="text-2xl md:text-3xl font-medium text-slate-800 leading-tight tracking-tight">
                {member?.customer_name || user?.user_metadata?.full_name || "Coffee Lover"}
              </h2>
              {member?.customer_code && (
                <p className="text-slate-400 text-xs font-mono tracking-wider mt-1">{member.customer_code}</p>
              )}
            </div>

            {member && (
              <div className="grid grid-cols-3 gap-2 mt-8 bg-[#FFF9FA] p-4 rounded-2xl border border-rose-50">
                <div className="text-center md:text-left">
                  <p className="text-[#FC687D] font-bold text-xl md:text-2xl lg:text-3xl leading-none">
                    {availablePts.toFixed(0)}
                  </p>
                  <p className="text-slate-500 text-[9px] uppercase font-semibold tracking-widest mt-1.5">Available</p>
                </div>
                <div className="text-center md:text-left border-l border-rose-100 pl-2">
                  <p className="text-slate-800 font-bold text-xl md:text-2xl lg:text-3xl leading-none">
                    {totalPts.toFixed(0)}
                  </p>
                  <p className="text-slate-500 text-[9px] uppercase font-semibold tracking-widest mt-1.5">Total</p>
                </div>
                <div className="text-center md:text-left border-l border-rose-100 pl-2">
                  <p className="text-slate-800 font-bold text-xl md:text-2xl lg:text-3xl leading-none">
                    {visits.toFixed(0)}
                  </p>
                  <p className="text-slate-500 text-[9px] uppercase font-semibold tracking-widest mt-1.5">Visits</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Desktop Profile Status Card */}
        <div className="hidden md:block bg-white rounded-2xl border border-rose-50 p-6 shadow-sm">
          <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-4">Authenticated As</p>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-lg">👤</div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{user?.email}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Verified Client</p>
            </div>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-500">
            📍 High-speed ordering, bookings and point monitoring features are completely operational.
          </div>
        </div>
      </div>

      {/* Quick Action Grid Section */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Quick Shortcuts</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                className="bg-white rounded-2xl p-5 border border-rose-50 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
              >
                <div className="text-2xl mb-3 bg-rose-50 w-12 h-12 rounded-full flex items-center justify-center">
                  {c.icon}
                </div>
                <p className="font-semibold text-slate-800 text-sm md:text-base">{c.label}</p>
                <p className="text-slate-400 text-[10px] font-medium uppercase tracking-widest mt-1">{c.sub}</p>
              </Link>
            ) : (
              <button
                key={c.label}
                onClick={() => setTab(c.tab)}
                className="bg-white rounded-2xl p-5 border border-rose-50 shadow-sm text-left hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 w-full"
              >
                <div className="text-2xl mb-3 bg-rose-50 w-12 h-12 rounded-full flex items-center justify-center text-[#FC687D]">
                  {c.icon}
                </div>
                <p className="font-semibold text-slate-800 text-sm md:text-base">{c.label}</p>
                <p className="text-slate-400 text-[10px] font-medium uppercase tracking-widest mt-1">{c.sub}</p>
              </button>
            )
          )}
        </div>
      </div>

      {/* Visit Us Block Section */}
      <div className="bg-white rounded-2xl p-6 border border-rose-50 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-4 mb-4 gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Our Outlets</p>
            <h3 className="text-lg font-semibold text-slate-800">Visit Juja Outlets</h3>
          </div>
          <div className="flex gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200 self-start md:self-auto">
            {Object.entries(BRANCHES).map(([key, b]) => (
              <button
                key={key}
                onClick={() => setBranch(key)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                  branch === key
                    ? "bg-[#FC687D] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {b.buttonLabel}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <div className="space-y-3.5 text-sm text-slate-600 font-medium">
            <p className="text-xs font-bold text-slate-800 uppercase tracking-widest">{active.name}</p>
            <p className="flex gap-3 items-start"><span className="text-base">📍</span>{active.address}</p>
            <p className="flex gap-3 items-start"><span className="text-base">📞</span>{active.phone}</p>
          </div>
          <div className="space-y-3 bg-[#FFF9FA] border border-rose-50/50 p-4 rounded-xl text-sm text-slate-600">
            <p className="flex gap-3 items-start">
              <span className="text-base">🕙</span>
              <span>
                <span className="font-bold text-slate-800 uppercase tracking-wider text-xs block mb-1">{active.hoursLabel}</span>
                {active.hours.map((line) => <span key={line} className="block font-medium">{line}</span>)}
              </span>
            </p>
            {active.room.length > 0 && (
              <p className="flex gap-3 items-start border-t border-rose-100/60 pt-2 mt-2">
                <span className="text-base">🏢</span>
                <span>
                  {active.room.map((line) => <span key={line} className="block text-slate-500 font-medium">{line}</span>)}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
    Customer Order: Add To Cart Modal View
────────────────────────────────────────────────────────────── */
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
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-[26px] md:rounded-[24px] p-6 shadow-2xl max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom md:fade-in duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Add to Selection</p>
            <h3 className="text-xl font-bold text-slate-800 mt-0.5">{item.name}</h3>
            <p className="text-sm font-semibold text-slate-500 mt-1">
              Base ₱{Number(item.price || 0).toFixed(0)}
              {variantPrice > 0 ? ` • +₱${variantPrice.toFixed(0)} variants` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500 font-bold"
          >
            ✕
          </button>
        </div>

        {Array.isArray(item.variants) && item.variants.length > 0 && (
          <div className="mt-4 space-y-5">
            {item.variants.map((g) => (
              <div key={g.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-700">
                    {g.name} {g.isRequired ? <span className="text-rose-500">*</span> : null}
                  </p>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    {g.isMultiSelect ? "Multi-select" : "Single-select"}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(g.options || []).map((o) => {
                    const sel = (selections[g.id] || []).find((x) => x.id === o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => toggleOption(g, o)}
                        className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-sm font-medium transition-all text-left ${
                          sel ? "border-rose-400 bg-rose-50/40 text-rose-900" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                        }`}
                      >
                        <span>{o.name}</span>
                        <span className="text-xs text-slate-400">
                          {Number(o.price) > 0 ? `+₱${Number(o.price).toFixed(0)}` : "FREE"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5">
          <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">
            Special Instructions
          </label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="E.g., less ice, sweetener options, etc..."
            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none h-20 resize-none focus:bg-white focus:border-rose-300 transition-all font-medium"
          />
        </div>

        <div className="mt-6 flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-slate-100">
          <div className="flex items-center w-full sm:w-36 h-12 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-inner">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-12 h-full text-xl text-slate-400 hover:text-rose-500 font-bold transition-colors"
            >
              −
            </button>
            <div className="flex-1 text-center font-bold text-slate-800">{quantity}</div>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="w-12 h-full text-xl text-slate-400 hover:text-rose-500 font-bold transition-colors"
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
            className="w-full sm:flex-1 h-12 rounded-xl text-white text-sm font-bold shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ backgroundColor: "#FC687D" }}
          >
            {canAdd ? `Add To Basket • ₱${(unitPrice * quantity).toFixed(0)}` : "Select Required Configurations"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <div
      className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm bg-white rounded-t-[26px] md:rounded-[20px] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Confirmation Required</p>
        <h3 className="text-lg font-bold text-slate-800 mt-0.5">{title}</h3>
        <p className="text-sm text-slate-500 mt-2.5 font-medium leading-relaxed">{message}</p>

        <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-slate-100">
          <button
            onClick={onCancel}
            className="w-full py-3 rounded-xl bg-slate-50 border border-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="w-full py-3 rounded-xl bg-[#FC687D] text-white text-xs font-bold shadow-sm hover:bg-rose-500 transition"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
    Order Tab (With Branch Selection & Realtime POS Sync)
────────────────────────────────────────────────────────────── */
function OrderTab({ user, member }) {
  const [items, setItems] = useState([]);
  const [cats, setCategories] = useState([]);
  const [activeTab, setActiveTab] = useState("ALL");
  const [itemSearch, setItemSearch] = useState("");

  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState("bcfa9d8f-f2e5-4573-b3e3-635901ec7a4e"); // Default branch UUID

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
      setItems(itemRes.data || []);
      setCategories([...(catRes.data || [])].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
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
      prev.map((x) => (x.cartItemId === cartItemId ? { ...x, quantity: Math.max(1, x.quantity + delta) } : x))
    );
  };
  const clearCart = () => {
    setCart([]);
    setConfirmClear(false);
    setCartOpen(false);
  };

  const checkout = async () => {
    if (!user?.id) {
      alert("❌ Check out failed: No active user session detected.");
      return;
    }
    if (cart.length === 0) {
      alert("❌ Basket is empty.");
      return;
    }

    setIsSubmitting(true);

    const orderPayload = {
      user_id: user.id,
      customer_name: member?.customer_name || user?.user_metadata?.full_name || "Web Customer",
      branch_id: selectedBranch,
      items: cart, 
      subtotal: Number(subtotal),
      status: "pending", 
    };

    console.log("🚀 Sending order payload to Supabase...", orderPayload);

    try {
      const { data, error, status, statusText } = await supabase
        .from("orders")
        .insert([orderPayload])
        .select();

      if (error) {
        console.error("❌ Supabase Database API Error:", error);
        throw error;
      }

      console.log("✅ Database Response Status:", status, statusText);
      console.log("📦 Row inserted data:", data);

      if (!data || data.length === 0) {
        alert("⚠️ Request processed, but database returned 0 rows. Check Supabase RLS policies!");
        return;
      }

      alert(`🎉 Order sent to POS! Reference ID: ${data[0].id.slice(0,8)}`);
      setCart([]); 
      setCartOpen(false);
    } catch (err) {
      console.error("❌ High-level try/catch failure:", err);
      alert(`❌ Order failed to send: ${err.message || "Network Timeout"}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const CartInnerListing = () => (
    <div className="flex flex-col h-full justify-between">
      <div className="flex-1 space-y-3 overflow-y-auto max-h-[40vh] lg:max-h-[50vh] pr-1">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12 px-4 text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
            <span className="text-3xl mb-2">🛒</span>
            <p className="text-sm font-semibold">Your cart is empty</p>
          </div>
        ) : (
          cart.map((line, idx) => (
            <div
              key={line.cartItemId}
              onClick={() => {
                const base = items.find((i) => i.id === line.id) || {};
                setSelectedItemForModal({ ...base, editData: line, editIndex: idx });
              }}
              className="w-full text-left border border-slate-200 bg-white rounded-xl p-3 hover:border-rose-200 transition cursor-pointer flex flex-col justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="flex justify-between items-start">
                  <p className="text-sm font-bold text-slate-800 truncate max-w-[70%]">{line.name}</p>
                  <p className="text-sm font-bold text-slate-800">₱{(line.unitPrice * line.quantity).toFixed(0)}</p>
                </div>
                {line.variantDetails && <p className="text-xs text-slate-400 mt-0.5 italic">{line.variantDetails}</p>}
                {line.instructions && <p className="text-xs text-[#FC687D] font-medium mt-1">Note: {line.instructions}</p>}
              </div>

              <div className="flex items-center justify-between border-t border-slate-50 pt-2 mt-1">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeLine(line.cartItemId); }}
                  className="text-xs font-bold text-red-500 hover:text-red-700 bg-red-50 px-2.5 py-1 rounded-lg"
                >
                  Delete
                </button>
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => changeQty(line.cartItemId, -1)}
                    className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-slate-600"
                  >
                    −
                  </button>
                  <span className="text-xs font-bold text-slate-800 px-1">{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => changeQty(line.cartItemId, 1)}
                    className="w-7 h-7 rounded-lg bg-[#FC687D] flex items-center justify-center font-bold text-white"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {cart.length > 0 && (
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
          <label className="block text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1.5">
            Select Pickup Store Branch
          </label>
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 outline-none cursor-pointer focus:border-[#FC687D]"
          >
            <option value="bcfa9d8f-f2e5-4573-b3e3-635901ec7a4e">
              Pasong Tamo Branch (36D Visayas Ave.)
            </option>
            <option value="e916bee8-3770-4650-9b46-d2e7d3ad49e6">
              Diliman Branch (8 Visayas Ave.)
            </option>
          </select>

          <div className="space-y-2 mt-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500 font-medium">Subtotal Amount</span>
              <span className="font-bold text-slate-800 text-lg">₱{subtotal.toFixed(0)}</span>
            </div>
            <button
              onClick={checkout}
              disabled={isSubmitting}
              className="w-full h-11 rounded-xl bg-[#FC687D] text-white text-xs font-bold uppercase tracking-wider shadow-sm hover:bg-rose-500 transition disabled:opacity-50"
            >
              {isSubmitting ? "Processing Checkout..." : "Send Order to POS"}
            </button>
            <button
              onClick={() => setConfirmClear(true)}
              disabled={isSubmitting}
              className="w-full h-11 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider hover:bg-slate-100 transition"
            >
              Reset Basket
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-3 lg:gap-8 items-start">
      <div className="lg:col-span-2 space-y-5">
        <div className="bg-white border border-rose-50 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Fresh Selection</p>
            <h2 className="text-lg font-bold text-slate-800">Order Menu</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value)}
              className="bg-slate-50 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700 outline-none border border-slate-200 cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              {cats.map((cat) => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
            <div className="relative flex-1 sm:flex-initial">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
              <input
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Search..."
                className="pl-8 pr-3 py-2 bg-slate-50 rounded-xl text-xs font-medium text-slate-800 outline-none border border-slate-200 w-full sm:w-[150px]"
              />
            </div>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center text-slate-400 border border-slate-100">
            ❌ No matching available products located.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedItemForModal(item)}
                className="group bg-white border border-slate-100 rounded-2xl p-3 text-left hover:-translate-y-1 hover:shadow-md transition-all duration-300 flex flex-col h-full justify-between"
              >
                <div>
                  <div className="w-full h-28 sm:h-32 rounded-xl bg-[#FFF9FA] border border-rose-50/50 flex items-center justify-center overflow-hidden">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl text-rose-200/40">📷</span>
                    )}
                  </div>
                  <div className="mt-3">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#FC687D] bg-rose-50 px-2 py-0.5 rounded-md">
                      {item.category || "General"}
                    </span>
                    <p className="text-sm font-bold text-slate-800 leading-tight mt-1.5">
                      {item.name}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-extrabold text-slate-800 mt-3 pt-2 border-t border-slate-50">
                  ₱{Number(item.price || 0).toFixed(0)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <aside className="hidden lg:block bg-white border border-rose-50 rounded-2xl p-5 shadow-sm sticky top-6 h-[calc(100vh-140px)]">
        <div className="border-b border-slate-100 pb-3 mb-4">
          <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
            <span>🛒</span> Shopping Basket
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{itemCount} items configured</p>
        </div>
        <div className="h-[calc(100%-70px)]">
          <CartInnerListing />
        </div>
      </aside>

      {cart.length > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-[88px] left-4 right-4 z-40 bg-slate-900 text-white flex items-center justify-between px-5 py-4 rounded-xl shadow-xl lg:hidden"
        >
          <div className="text-left">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Current Order</p>
            <p className="text-sm font-bold">{itemCount} Selected Item(s)</p>
          </div>
          <div className="text-right flex items-center gap-2">
            <span className="text-base font-extrabold text-[#FC687D]">₱{subtotal.toFixed(0)}</span>
            <span className="text-xs bg-white/10 px-2.5 py-1 rounded-lg">View 🛒</span>
          </div>
        </button>
      )}

      {cartOpen && (
        <div
          className="fixed inset-0 z-[85] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 lg:hidden"
          onClick={() => setCartOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-[24px] md:rounded-[20px] p-5 shadow-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Your Basket</h3>
                <p className="text-xs text-slate-400">{itemCount} items</p>
              </div>
              <button
                onClick={() => setCartOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <CartInnerListing />
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
          title="Reset Shopping Basket?"
          message="Are you certain you wish to discard items?"
          onCancel={() => setConfirmClear(false)}
          onConfirm={clearCart}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
    Loyalty Tab
────────────────────────────────────────────────────────────── */
function LoyaltyTab({ member, setMember, user }) {
  const [mode, setMode] = useState(null); 
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const [form, setForm] = useState({ customer_name: "", Phone: "", City: "", Note: "" });

  const [vouchersActive, setVouchersActive] = useState([]);
  const [vouchersRedeemed, setVouchersRedeemed] = useState([]);
  const [vouchersExpired, setVouchersExpired] = useState([]);
  const [voucherView, setVoucherView] = useState("active");
  const [loadingVouchers, setLoadingVouchers] = useState(false);

  const [nowTick, setNowTick] = useState(Date.now());

  const [checkingMatch, setCheckingMatch] = useState(false);
  const [matchChecked, setMatchChecked] = useState(false);
  const [matchedPreview, setMatchedPreview] = useState(null);

  const available = Number(member?.["Available points"] || 0);
  const progress = ((available % 100) / 100) * 100;
  const nextReward = (Math.floor(available / 100) + 1) * 100;

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

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
      const todayStr = today.toISOString().slice(5, 10); 
      const birth = member.Note; 
      const [, mon, day] = birth.split("-");
      const monthIndex = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(mon);
      if (monthIndex === -1) return;

      const bdayFormatted = `${String(monthIndex + 1).padStart(2, "0")}-${day}`;
      if (bdayFormatted !== todayStr) return;

      const year = today.getFullYear();
      const { data: existing } = await supabase.from("vouchers").select("id").eq("member_id", member.id);
      const alreadyHas = (existing || []).some(v => v.code?.startsWith(`BDAY${year}`));
      if (alreadyHas) return;

      await supabase.from("vouchers").insert({
        member_id: member.id,
        code: `BDAY${year}-${Math.floor(Math.random()*10000)}`,
        reward_text: "FREE 16oz Drink or Waffle (Birthday Reward)",
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), 
        status: "active",
        reward_type: "birthday",
      });
    }
    createBirthdayVoucherIfNeeded();
  }, [member]);

  const computeStatus = (v) => {
    if (!v) return "active";
    if (String(v.status).toLowerCase() === "redeemed") return "redeemed";
    if (String(v.status).toLowerCase() === "expired") return "expired";
    if (String(v.status).toLowerCase() === "active") {
      const expMs = v.expires_at ? new Date(v.expires_at).getTime() : 0;
      if (expMs && expMs <= nowTick) return "expired";
      return "active";
    }
    return "active";
  };

  const manilaDateKey = (d) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

  const expiryCountdownDetailed = (expires_at) => {
    if (!expires_at) return { text: "—", expiresTonight: false };
    const exp = new Date(expires_at);
    const ms = exp.getTime() - nowTick;
    if (ms <= 0) return { text: "Expired", expiresTonight: false };
    const days = Math.floor(ms / 86400000);
    const hrs = Math.floor((ms % 86400000) / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return {
      text: days > 0 ? `Expires in ${days}d ${hrs}h` : `Expires in ${hrs}h ${mins}m`,
      expiresTonight: manilaDateKey(new Date()) === manilaDateKey(exp),
    };
  };

  useEffect(() => {
    async function fetchVouchers() {
      if (!member?.id) return;
      setLoadingVouchers(true);
      const { data } = await supabase.from("vouchers").select("*").eq("member_id", member.id).order("issued_at", { ascending: false });
      const rows = data || [];
      
      const normalized = rows.map((v) => ({ ...v, _computedStatus: computeStatus(v), _isBirthday: isBirthdayVoucher(v) }));
      setVouchersActive(normalized.filter(v => v._computedStatus === "active"));
      setVouchersRedeemed(normalized.filter(v => v._computedStatus === "redeemed"));
      setVouchersExpired(normalized.filter(v => v._computedStatus === "expired"));
      setLoadingVouchers(false);
    }
    fetchVouchers();
  }, [member?.id, nowTick]);

  const createMember = async () => {
    if (!user?.id) return;
    const b = normalizeBirthday(form.Note);
    if (!b.ok) { setNotice("⚠️ " + b.msg); return; }
    if (!form.customer_name || !form.City || !form.Phone) { setNotice("⚠️ Please complete all fields."); return; }
    
    setLoading(true);
    try {
      const { data, error } = await supabase.from("loyalty_members").insert([{
        user_id: user.id, "Customer ID": genCustomerId(), customer_name: form.customer_name,
        Email: user.email, Phone: form.Phone, City: form.City, customer_code: genMemberCode(),
        "Points balance": 0, "Available points": 0, Note: b.value, first_visit: todayISO()
      }]).select().single();
      if (error) throw error;
      setMember(data);
      setMode(null);
    } catch (err) { setNotice("❌ " + err.message); }
    setLoading(false);
  };

  const checkMatchPreview = async () => {
    const b = normalizeBirthday(form.Note);
    if (!b.ok) { setNotice("⚠️ " + b.msg); return; }
    setCheckingMatch(true);
    const { data } = await supabase.from("loyalty_members").select("*").ilike("customer_name", form.customer_name).eq("Note", b.value).maybeSingle();
    setMatchedPreview(data || null);
    setMatchChecked(true);
    setCheckingMatch(false);
  };

  const requestLink = async () => {
    const b = normalizeBirthday(form.Note);
    const { error } = await supabase.from("loyalty_link_requests").insert({
      user_id: user.id, input_name: form.customer_name, input_birthday: b.value, matched_member_id: matchedPreview?.id || null, status: "pending"
    }).select().single();
    if (!error) {
      alert("✅ Authorization sync request logged effectively.");
    }
  };

  if (!member && !mode) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-6 animate-in fade-in duration-300">
        <div className="bg-gradient-to-br from-[#FFF9FA] to-rose-50 border border-rose-100 rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800">⭐ Juja Rewards Program</h2>
          <p className="text-sm text-slate-600 mt-1">Earn points and enjoy exclusive rewards every time you grab bites or brews.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <div className="bg-white p-4 rounded-xl border border-rose-100/60">
              <span className="text-xl block mb-1">🎯</span>
              <p className="text-xs font-bold text-slate-700">100 Points Reward</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Free 16oz handcrafted beverage or signature grid waffle.</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-rose-100/60">
              <span className="text-xl block mb-1">🎂</span>
              <p className="text-xs font-bold text-slate-700">Birthday Perk</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Complementary reward allocated automatically during birthdates.</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-rose-100/60">
              <span className="text-xl block mb-1">⚡</span>
              <p className="text-xs font-bold text-slate-700">Fast Accumulation</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Acquire 1 point per ₱25 currency allocation dynamically.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={() => setMode("new")} className="flex-1 h-12 bg-[#FC687D] text-white font-bold text-sm rounded-xl shadow-sm hover:bg-rose-500 transition">Sign Up Program</button>
          <button onClick={() => setMode("existing")} className="flex-1 h-12 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-xl hover:bg-slate-50 transition">Link Existing Loyalty Card</button>
        </div>
      </div>
    );
  }

  if (!member && (mode === "new" || mode === "existing")) {
    return (
      <div className="max-w-md mx-auto bg-white p-6 border border-slate-100 rounded-2xl shadow-sm space-y-4">
        <h3 className="text-lg font-bold text-slate-800 uppercase tracking-wide">{mode === "new" ? "Create Membership Account" : "Verify Profile Identity"}</h3>
        {notice && <p className="text-xs font-semibold text-rose-500 bg-rose-50 p-2.5 rounded-lg">{notice}</p>}
        <div className="space-y-3">
          <input placeholder="Full Registration Name" value={form.customer_name} onChange={(e)=>setForm({...form, customer_name: e.target.value})} className="w-full border border-slate-200 px-4 py-3 rounded-xl text-sm font-medium outline-none" />
          <input placeholder="Birthday (YYYY-MMM-DD) e.g., 1995-Dec-25" value={form.Note} onChange={(e)=>setForm({...form, Note: e.target.value})} className="w-full border border-slate-200 px-4 py-3 rounded-xl text-sm font-mono outline-none" />
          {mode === "new" && (
            <>
              <input placeholder="City Location" value={form.City} onChange={(e)=>setForm({...form, City: e.target.value})} className="w-full border border-slate-200 px-4 py-3 rounded-xl text-sm font-medium outline-none" />
              <input placeholder="Mobile Contact Number" value={form.Phone} onChange={(e)=>setForm({...form, Phone: e.target.value})} className="w-full border border-slate-200 px-4 py-3 rounded-xl text-sm font-medium outline-none" />
            </>
          )}
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={()=>setMode(null)} className="flex-1 py-3 bg-slate-50 border border-slate-100 text-slate-600 font-bold rounded-xl text-xs uppercase tracking-wider">Back</button>
          {mode === "new" ? (
            <button onClick={createMember} disabled={loading} className="flex-1 py-3 bg-[#FC687D] text-white font-bold rounded-xl text-xs uppercase tracking-wider">{loading ? "Saving..." : "Register Card"}</button>
          ) : (
            <button onClick={checkMatchPreview} disabled={checkingMatch} className="flex-1 py-3 bg-slate-800 text-white font-bold rounded-xl text-xs uppercase tracking-wider">Check System Match</button>
          )}
        </div>
        {matchChecked && mode === "existing" && (
          <div className="border border-slate-100 bg-slate-50 p-4 rounded-xl mt-2 text-center text-xs">
            {matchedPreview ? (
              <div>
                <p className="text-green-600 font-bold">Profile identified matching criteria. ✅</p>
                <button onClick={requestLink} className="mt-3 w-full py-2 bg-[#FC687D] text-white rounded-lg font-bold">Submit Sync Authorization Link</button>
              </div>
            ) : <p className="text-red-500 font-semibold">No pre-existing dynamic customer references located matching metrics.</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in duration-300">
      <div className="md:col-span-1 space-y-4">
        {/* Passcode / Membership passcard block */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 rounded-2xl p-5 text-white relative overflow-hidden shadow-md">
          <div className="relative z-10 flex flex-col justify-between h-full min-h-[160px]">
            <div>
              <p className="text-[9px] uppercase tracking-[0.2em] text-rose-300 font-bold">Juja Digital Membership Pass</p>
              <h4 className="text-lg font-bold tracking-tight mt-1 truncate">{member?.customer_name}</h4>
            </div>
            <div className="bg-white p-2.5 rounded-lg inline-block self-center shadow-md border border-slate-100 mt-4">
              <Barcode value={member?.customer_code || "JUJA000000"} background="transparent" lineColor="#0f172a" width={1.2} height={50} displayValue fontSize={11} margin={0} />
            </div>
          </div>
        </div>

        {/* Dynamic metrics card tracking view module stack */}
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm grid grid-cols-3 md:grid-cols-1 gap-2">
          <div className="p-2 bg-rose-50/40 border border-rose-100/50 rounded-lg text-center md:text-left md:flex md:justify-between md:items-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block md:inline">Balance</span>
            <span className="text-lg font-extrabold text-[#FC687D] block">{available.toFixed(0)} pts</span>
          </div>
          <div className="p-2 bg-slate-50 border border-slate-100 rounded-lg text-center md:text-left md:flex md:justify-between md:items-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block md:inline">Visits</span>
            <span className="text-sm font-bold text-slate-700 block">{member?.["Total visits"] || 0}</span>
          </div>
          <div className="p-2 bg-slate-50 border border-slate-100 rounded-lg text-center md:text-left md:flex md:justify-between md:items-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block md:inline">Location</span>
            <span className="text-xs font-bold text-slate-700 block truncate max-w-[80px] md:max-w-none">{member?.["City"] || "—"}</span>
          </div>
        </div>
      </div>

      {/* Main Column Body Tracking Vouchers And Lists */}
      <div className="md:col-span-2 space-y-6">
        <div className="bg-white border border-rose-50 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <h3 className="font-bold text-slate-800 text-sm">Reward Progress Milestone</h3>
            <span className="text-xs font-bold text-slate-400">{available.toFixed(0)} / {nextReward} pts</span>
          </div>
          <div className="w-full h-3 bg-slate-100 border border-slate-200/60 rounded-full overflow-hidden">
            <div className="h-full bg-[#FC687D] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs font-medium text-slate-500 mt-2.5">🎁 Only {(nextReward - available).toFixed(0)} additional points required to qualify for subsequent product voucher allocation metrics.</p>
        </div>

        {/* Voucher Container Interface Frame element */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-4">
            <h3 className="font-bold text-slate-800 text-sm">System Voucher Passports</h3>
            <div className="flex gap-1 bg-slate-50 border border-slate-200 p-0.5 rounded-xl self-start sm:self-auto">
              {["active", "redeemed", "expired"].map((categoryKey) => (
                <button
                  key={categoryKey}
                  onClick={() => setVoucherView(categoryKey)}
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                    voucherView === categoryKey ? "bg-white text-slate-800 shadow-sm border border-slate-200/40" : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {categoryKey}
                </button>
              ))}
            </div>
          </div>

          {/* List framework inner renderer engine layout content segment block */}
          {(() => {
            const currentArraySource = voucherView === "active" ? vouchersActive : voucherView === "redeemed" ? vouchersRedeemed : vouchersExpired;
            if (loadingVouchers) {
              return <div className="text-center py-8 text-xs text-slate-400">Loading values...</div>;
            }
            if (currentArraySource.length === 0) {
              return <div className="text-center py-8 text-slate-400 text-xs font-medium">No vouchers allocated inside this ledger.</div>;
            }
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentArraySource.map((v) => {
                  const countdownObj = voucherView === "active" ? expiryCountdownDetailed(v.expires_at) : null;
                  return (
                    <div key={v.id} className={`border p-3.5 rounded-xl flex flex-col justify-between ${v._isBirthday ? "bg-rose-50/30 border-rose-100" : "bg-white border-slate-200/70"}`}>
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-800 truncate">{v._isBirthday ? "🎂 Birthday Special" : "🎁 Points Reward"}</span>
                          {countdownObj?.expiresTonight && <span className="bg-amber-50 text-amber-700 text-[9px] font-extrabold uppercase border border-amber-200 px-1.5 rounded">Expiring</span>}
                        </div>
                        <p className="text-xs text-slate-600 mt-1 font-medium leading-relaxed">{v.reward_text}</p>
                      </div>
                      <div className="border-t border-slate-50 pt-2.5 mt-3 flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span>Code: {v.code}</span>
                        <span className="font-sans font-bold text-slate-500">{voucherView === "active" ? "Exp: " + fmtDate(v.expires_at) : voucherView === "redeemed" ? "Used" : "Expired"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
    Profile Tab
────────────────────────────────────────────────────────────── */
function ProfileTab({ user, onLogout }) {
  return (
    <div className="max-w-md mx-auto animate-in fade-in duration-300 py-4">
      <div className="bg-white rounded-2xl border border-rose-50 shadow-sm p-6 text-center">
        <div className="w-20 h-20 rounded-full bg-rose-50 flex items-center justify-center text-4xl mx-auto mb-4 border border-rose-100/50">
          👤
        </div>
        <h3 className="text-lg font-bold text-slate-800 truncate max-w-full mb-1">{user?.email}</h3>
        <span className="text-[10px] uppercase font-bold tracking-widest bg-rose-50 text-[#FC687D] px-3 py-1 rounded-full border border-rose-100/40">
          Juja Member Portal
        </span>

        <div className="border-t border-slate-100 my-6 pt-4 text-left space-y-3 text-xs text-slate-500 font-medium">
          <p className="flex justify-between"><span>User System ID:</span> <span className="font-mono text-slate-700">{user?.id?.slice(0, 12)}...</span></p>
          <p className="flex justify-between"><span>Session Authorization:</span> <span className="text-green-600 font-bold">Active Token</span></p>
        </div>

        <button
          onClick={onLogout}
          className="w-full h-11 bg-slate-50 hover:bg-red-50 hover:text-red-600 text-slate-500 font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-100 transition"
        >
          Sign Out of Session
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
    Main Responsive Customer Hub Page Controller
────────────────────────────────────────────────────────────── */
export default function Customer() {
  const [user, setUser] = useState(null);
  const [member, setMember] = useState(null);
  const [tab, setTab] = useState("home");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // PWA Add to Home Screen states
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  // Core Authentication & Dynamic Manifest Swap Loop
  useEffect(() => {
    // Override standard root layout manifest to match customer specifications
    let link = document.querySelector("link[rel='manifest']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.href = "/manifest-hub.json";

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
        console.warn("No active member profiles registered.", e);
      }

      setLoading(false);
    }

    loadData();
  }, [router]);

  // Realtime update handler
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("loyalty-live-update")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "loyalty_members" },
        { filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload?.new) setMember(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Capture PWA installation prompts exclusively for smartphones
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      
      const isBannerDismissed = localStorage.getItem("juja_pwa_dismissed") === "true";
      if (!isBannerDismissed) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const triggerPwaInstallation = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`📦 Customer home installation choice logged: ${outcome}`);
    
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  const closeInstallBannerForever = () => {
    localStorage.setItem("juja_pwa_dismissed", "true");
    setShowInstallBanner(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7]">
        <div className="w-9 h-9 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
      </div>
    );
  }

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-[#FFF5F7] text-slate-800 antialiased flex flex-col lg:flex-row">
      {/* Universal Navigation Layout Component */}
      <AppNavigation tab={tab} setTab={setTab} />

      {/* Primary Scrollable Workspace Viewport Layout Frame */}
      <main className="flex-1 overflow-x-hidden min-h-screen pb-32 pt-4 md:pt-8 px-4 sm:px-6 lg:pl-72 lg:pr-8 max-w-7xl mx-auto w-full transition-all">
        {tab === "home" && <HomeTab member={member} user={user} setTab={setTab} />}
        {tab === "order" && <OrderTab user={user} member={member} />}
        {tab === "loyalty" && <LoyaltyTab member={member} setMember={setMember} user={user} />}
        {tab === "booking" && <BookingTab user={user} member={member} />}
        {tab === "profile" && <ProfileTab user={user} onLogout={logout} />}
      </main>

      {/* Modern, Aesthetic Customer PWA App Banner Slideover */}
      {showInstallBanner && (
        <div className="fixed bottom-[84px] md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-[90] bg-white border border-rose-100 p-4 rounded-2xl shadow-[0_10px_30px_rgba(252,104,125,0.12)] flex items-center justify-between gap-4 animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl border border-rose-50 flex items-center justify-center bg-[#FFF9FA] overflow-hidden shrink-0">
              <img src={LOGO} alt="Juja App Logo" className="w-8 h-8 object-contain" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">Install Juja Brew & Bites</p>
              <p className="text-[10px] text-slate-400 font-medium">Order faster & manage your loyalty pass directly on your device home screen.</p>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <button
              onClick={triggerPwaInstallation}
              className="px-3 py-1.5 bg-[#FC687D] hover:bg-rose-500 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-sm transition"
            >
              Install
            </button>
            <button
              onClick={closeInstallBannerForever}
              className="text-[9px] uppercase tracking-wider text-slate-400 hover:text-slate-600 font-bold text-center"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}