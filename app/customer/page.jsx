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

/* ──────────────────────────────────────────────────────────────
   Bottom Tab Bar
────────────────────────────────────────────────────────────── */
function TabBar({ tab, setTab }) {
  const tabs = [
    { id: "home", icon: "🏠", label: "Home" },
    { id: "order", icon: "🍽️", label: "Order" },
    { id: "loyalty", icon: "⭐", label: "Loyalty" },
    { id: "booking", icon: "🗓", label: "Book" },
    { id: "promo", icon: "🎁", label: "Promo" },
    { id: "profile", icon: "👤", label: "Profile" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-rose-50 pb-safe shadow-[0_-4px_24px_rgba(252,104,125,0.05)]">
      <div className="max-w-6xl mx-auto px-4 grid grid-cols-5 px-1 md:px-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative flex flex-col items-center justify-center py-2.5 md:py-3 gap-0.5 md:gap-1 transition-all duration-300 active:scale-90 ${
              tab === t.id
                ? "text-[#FC687D]"
                : "text-slate-400 hover:text-slate-600"
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
   Home Tab (Visit Us with Branch Buttons)
────────────────────────────────────────────────────────────── */
function HomeTab({ member, user, setTab }) {
  const pts = parseFloat(member?.["Points balance"] ?? 0) || 0;
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
            <img
              src={LOGO}
              alt="Juja"
              className="h-8 md:h-10 w-auto object-contain"
            />
          </Link>

          <div className="leading-tight">
            <p className="text-[10px] md:text-[11px] uppercase tracking-widest text-slate-400">
              Juja Brew &amp; Bites
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
            {member?.customer_name ||
              user?.user_metadata?.full_name ||
              "Coffee Lover"}
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
                  {pts.toFixed(0)}
                </p>
                <p className="text-slate-500 text-[9px] md:text-[10px] uppercase font-normal tracking-widest mt-1">
                  Points
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
              <p className="font-normal text-slate-800 text-[13px] md:text-[15px]">
                {c.label}
              </p>
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
              <p className="font-normal text-slate-800 text-[13px] md:text-[15px]">
                {c.label}
              </p>
              <p className="text-slate-400 text-[9px] md:text-[11px] font-normal uppercase tracking-widest mt-0.5">
                {c.sub}
              </p>
            </button>
          )
        )}
      </div>

      {/* Visit Us (Branch Buttons) */} {/* Branch info matches your existing site content. [2](https://onedrive.live.com/?id=af43a453-b117-4668-9f62-738214f89b46&cid=933e55cc8541ec41&web=1) */}
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

/* ──────────────────────────────────────────────────────────────
   Order Tab
────────────────────────────────────────────────────────────── */
function OrderTab({ user }) {
  const [items, setItems] = useState([]);
  const [cats, setCategories] = useState([]);
  const [activeTab, setActiveTab] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [cart, setCart] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMenu() {
      setLoading(true);

      const [itemRes, catRes] = await Promise.all([
        // ✅ public menu: show only available + NOT pos-only
        supabase
          .from("menu_items")
          .select("*")
          .eq("is_available", true)
          .eq("pos_only", false)
          .order("name"),

        // ✅ public menu: show only active + NOT pos-only, sorted alphabetically
        supabase
          .from("menu_categories")
          .select("*")
          .eq("is_active", true)
          .eq("pos_only", false)
          .order("name", { ascending: true }),
      ]);

      if (itemRes.data) setItems(itemRes.data);

      if (catRes.data) {
        // extra safety: sort client-side too (alphabetical)
        const sortedCats = [...catRes.data].sort((a, b) =>
          (a.name || "").localeCompare(b.name || "")
        );
        setCategories(sortedCats);

        if (sortedCats.length > 0) setActiveTab(sortedCats[0].name);
      }

      setLoading(false);
    }

    fetchMenu();
  }, []);

  // ✅ Search should be for ALL items:
  // - if itemSearch has text → search across all items (ignore category)
  // - if itemSearch is empty → show items only from selected category
  const q = itemSearch.trim().toLowerCase();
  const filtered = (q
    ? items.filter((i) => (i.name || "").toLowerCase().includes(q))
    : items.filter((i) => i.category === activeTab)
  );

  const cartArr = Object.values(cart);
  const total = cartArr.reduce((s, e) => s + e.price * e.qty, 0);

  const add = (item) =>
    setCart((c) => ({
      ...c,
      [item.id]: c[item.id]
        ? { ...c[item.id], qty: c[item.id].qty + 1 }
        : { id: item.id, name: item.name, price: item.price, qty: 1 },
    }));

  const remove = (id) =>
    setCart((c) => {
      const n = { ...c };
      if (n[id]?.qty > 1) n[id] = { ...n[id], qty: n[id].qty - 1 };
      else delete n[id];
      return n;
    });

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
      </div>
    );
  }

  const catsSorted = [...cats].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "")
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-white border border-rose-50 rounded-2xl p-3 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {/* Category Dropdown */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
              Category
            </label>
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value)}
              disabled={q.length > 0} // optional: lock category when searching globally
              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all disabled:opacity-60"
            >
              {catsSorted.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>

            {/* optional helper text */}
            {q.length > 0 && (
              <p className="text-[10px] text-slate-400 mt-1">
                Searching all items (category filter is ignored)
              </p>
            )}
          </div>

          {/* Item Search (ALL items) */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
              Search Item (All)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                🔍
              </span>
              <input
                type="text"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Search across all items..."
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Items Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {filtered.map((item) => {
          const inCart = cart[item.id]?.qty || 0;

          return (
            <div key={item.id} className="bg-white border border-rose-50 rounded-2xl p-3 shadow-sm">
              <div className="w-full h-24 rounded-xl bg-[#FFF9FA] border border-rose-50 flex items-center justify-center overflow-hidden mb-2">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl text-rose-200/50">📷</span>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-800 leading-tight">
                  {item.name}
                </p>

                {/* show category when searching globally */}
                {q.length > 0 && (
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">
                    {item.category}
                  </p>
                )}

                <p className="text-xs font-semibold text-slate-500">₱{item.price}</p>
              </div>

              <div className="mt-3">
                {inCart > 0 ? (
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => remove(item.id)}
                      className="w-8 h-8 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-600 font-bold shadow-sm active:scale-95"
                    >
                      −
                    </button>

                    <div className="flex-1 text-center text-sm font-bold text-slate-800">
                      {inCart}
                    </div>

                    <button
                      onClick={() => add(item)}
                      className="w-8 h-8 rounded-xl bg-[#FC687D] flex items-center justify-center text-white font-bold shadow-sm active:scale-95"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => add(item)}
                    className="w-full py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest text-[#FC687D] bg-[#FFF9FA] border border-rose-100 hover:bg-[#FC687D] hover:text-white transition-all active:scale-95"
                  >
                    Add to Cart
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Optional cart total */}
      {cartArr.length > 0 && (
        <div className="sticky bottom-3 bg-slate-900 text-white rounded-2xl p-4 shadow-2xl flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-300">Cart Total</p>
            <p className="text-lg font-bold">₱{total.toFixed(0)}</p>
          </div>
          <p className="text-sm font-semibold">
            {cartArr.reduce((s, x) => s + x.qty, 0)} item(s)
          </p>
        </div>
      )}
    </div>
  );
}
/* ──────────────────────────────────────────────────────────────
   Loyalty Tab (Perks content matches your longer version) [1](https://onedrive.live.com/personal/933e55cc8541ec41/_layouts/15/doc.aspx?resid=eb4cb160-5ac1-4fd9-abe6-dc3829e3f276&cid=933e55cc8541ec41)
────────────────────────────────────────────────────────────── */
function LoyaltyTab({ member, setMember, user }) {
  const [joining, setJoining] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showPerks, setShowPerks] = useState(false);
  const [saving, setSaving] = useState(false);

  const [vouchers, setVouchers] = useState([]);
  const [loadingVouchers, setLoadingVouchers] = useState(false);

  const [form, setForm] = useState({
    customer_name: "",
    Phone: "",
    City: "",
    Note: "",
  });

  const pts = useMemo(() => parseFloat(member?.["Points balance"] ?? 0) || 0, [member]);

  const join = async () => {
    if (!user?.id) return;
    setJoining(true);

    try {
      const existing = await supabase
        .from("loyalty_members")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing.data) {
        setMember(existing.data);
        setJoining(false);
        return;
      }

      const payload = {
        user_id: user.id,
        "Customer ID": genCustomerId(),
        customer_name: user?.user_metadata?.full_name || "",
        Email: user?.email || null,
        Phone: null,
        City: null,
        customer_code: genMemberCode(),
        "Points balance": 0,
        Note: null,
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

      if (error) alert(error.message);
      else setMember(data);
    } catch (e) {
      console.error(e);
    }

    setJoining(false);
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

    setSaving(true);
    try {
      const updateData = {
        customer_name: form.customer_name,
        Phone: form.Phone,
        City: form.City,
        Note: form.Note,
      };

      const { data, error } = await supabase
        .from("loyalty_members")
        .update(updateData)
        .eq("id", member.id)
        .select()
        .single();

      if (error) alert(error.message);
      else {
        setMember(data);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const fmtDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString();
  };

  useEffect(() => {
    async function fetchVouchers() {
      if (!member?.id) return;
      setLoadingVouchers(true);

      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("vouchers")
        .select("id, code, reward_text, issued_at, expires_at, status")
        .eq("member_id", member.id)
        .eq("status", "active")
        .gt("expires_at", nowIso)
        .order("issued_at", { ascending: false });

      if (!error) setVouchers(data || []);
      setLoadingVouchers(false);
    }

    fetchVouchers();
  }, [member?.id]);

  if (!member) {
    return (
      <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h2 className="text-2xl md:text-[28px] font-normal text-slate-800 tracking-tight">
            Loyalty Program
          </h2>
          <p className="text-slate-500 text-xs md:text-sm mt-0.5 font-normal">
            Earn points on every purchase
          </p>
        </div>

        <div className="bg-white rounded-2xl md:rounded-[32px] border border-rose-50 shadow-sm p-6 md:p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-rose-50 rounded-full blur-3xl" />
          <div
            className="text-5xl md:text-6xl mb-4 md:mb-6 relative z-10 animate-bounce"
            style={{ animationDuration: "3s" }}
          >
            ⭐
          </div>
          <h3 className="text-xl md:text-2xl font-normal text-slate-800 mb-2 relative z-10">
            Join Juja Rewards
          </h3>

          <button
            onClick={join}
            disabled={joining}
            className="w-full py-3.5 md:py-4 rounded-xl md:rounded-full font-normal text-[11px] md:text-[13px] uppercase tracking-widest text-white transition-all duration-300 bg-[#FC687D] hover:bg-rose-500 shadow-[0_8px_20px_rgba(252,104,125,0.25)] active:scale-95 disabled:opacity-50"
          >
            {joining ? "Creating account…" : "Join For Free →"}
          </button>
        </div>
      </div>
    );
  }

  const progress = ((pts % 100) / 100) * 100;
  const nextReward = (Math.floor(pts / 100) + 1) * 100;

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl md:text-[28px] font-normal text-slate-800 tracking-tight">
          JUJA Loyalty Program
        </h2>
        <p className="text-slate-500 text-xs md:text-sm mt-0.5 font-normal">
          Member Dashboard
        </p>
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
              Total Points
            </p>
            <p className="text-2xl md:text-3xl font-normal text-white">{pts.toFixed(0)}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl md:rounded-[24px] p-5 md:p-6 border border-rose-50 shadow-sm">
        <div className="flex justify-between items-end mb-3">
          <p className="font-normal text-slate-800 text-[13px] md:text-[15px]">Points Progress</p>
          <p className="text-[10px] md:text-xs font-normal text-slate-400">
            {pts.toFixed(0)} / {nextReward} pts
          </p>
        </div>

        <div className="w-full h-2.5 md:h-3 bg-slate-100 rounded-full overflow-hidden mb-3 border border-slate-200">
          <div className="h-full rounded-full bg-[#FC687D]" style={{ width: `${progress}%` }} />
        </div>

        <p className="text-[10px] md:text-[11px] font-normal text-slate-500">
          {(nextReward - pts).toFixed(0)} more points until your next free reward 🎁
        </p>
      </div>

      <div className="bg-white rounded-xl md:rounded-[24px] p-5 md:p-6 border border-rose-50 shadow-sm">
        <div className="flex items-end justify-between mb-3">
          <p className="font-normal text-slate-800 text-[13px] md:text-[15px]">Your Vouchers</p>
          <p className="text-[10px] md:text-xs font-normal text-slate-400">
            {loadingVouchers ? "Loading…" : `${vouchers.length} active`}
          </p>
        </div>

        {vouchers.length === 0 ? (
          <p className="text-[11px] md:text-[12px] text-slate-500">
            No vouchers yet — reach 100 points to receive a reward 🎁
          </p>
        ) : (
          <div className="space-y-3">
            {vouchers.map((v) => (
              <div key={v.id} className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[12px] md:text-[13px] font-semibold text-slate-800">
                      🎁 Reward Voucher
                    </p>
                    <p className="text-[11px] md:text-[12px] text-slate-600 mt-1 leading-relaxed">
                      {v.reward_text}
                    </p>
                    <p className="text-[10px] md:text-[11px] text-slate-400 mt-2 font-mono">
                      Code: {v.code}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-[10px] md:text-[11px] text-slate-400">Expires</p>
                    <p className="text-[11px] md:text-[12px] font-semibold text-slate-800">
                      {fmtDate(v.expires_at)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
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
                ["Note", "Birthday (YYYY-MM-DD)", "text", "1995-12-25"],
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

      {/* Perks Modal (FULL content) — matches your long perks text [1](https://onedrive.live.com/personal/933e55cc8541ec41/_layouts/15/doc.aspx?resid=eb4cb160-5ac1-4fd9-abe6-dc3829e3f276&cid=933e55cc8541ec41) */}
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
              <h3 className="text-xl md:text-2xl font-normal text-slate-800">
                Perks
              </h3>
              <button
                onClick={() => setShowPerks(false)}
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

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
                  <li>💙 Earn 1 JUJA Point for every ₱25 spent on food &amp; drinks.</li>
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

              <section className="bg-slate-50 border border-slate-200 rounded-2xl p-4 md:p-5">
                <h4 className="text-[10px] md:text-[11px] font-semibold text-slate-800 uppercase tracking-widest">
                  Expiration Policy
                </h4>
                <p className="mt-3 text-[12px] md:text-[13px] leading-relaxed">
                  All JUJA Points expire every <b>December 31, 11:59 PM.</b>
                </p>
              </section>

              <section className="bg-slate-50 border border-slate-200 rounded-2xl p-4 md:p-5">
                <h4 className="text-[10px] md:text-[11px] font-semibold text-slate-800 uppercase tracking-widest">
                  Flavor Selection
                </h4>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-white border border-slate-200 rounded-xl p-3">
                    <p className="text-[11px] font-semibold text-slate-800 mb-2">
                      Flavor Selection for Waffles
                    </p>
                    <ul className="space-y-1 text-[12px] md:text-[13px]">
                      <li>• Honey Syrup</li>
                      <li>• Choco Oreo</li>
                      <li>• Cheese</li>
                      <li>• Blueberry Whip</li>
                      <li>• Strawberry Whip</li>
                      <li>• Mango Graham</li>
                    </ul>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-3">
                    <p className="text-[11px] font-semibold text-slate-800 mb-2">
                      Flavor Selection for Mini Donuts
                    </p>
                    <ul className="space-y-1 text-[12px] md:text-[13px]">
                      <li>• Chocolate</li>
                      <li>• White Chocolate</li>
                      <li>• Strawberry</li>
                      <li>• Matcha</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="bg-rose-50 border border-rose-200 rounded-2xl p-4 md:p-5">
                <h4 className="text-[10px] md:text-[11px] font-semibold text-rose-700 uppercase tracking-widest">
                  📌 Terms &amp; conditions apply.
                </h4>
                <ul className="mt-3 space-y-2 text-[12px] md:text-[13px] leading-relaxed">
                  <li>• Rewards and perks are non-transferable and cannot be exchanged for cash.</li>
                  <li>• Lost loyalty card? Request a digital copy in-store.</li>
                  <li>• JUJA Brew &amp; Bites reserves the right to amend these guidelines without prior notice.</li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Profile Tab
────────────────────────────────────────────────────────────── */
function PromoTab({ setTab, setAppliedPromo }) {
  const [promos, setPromos] = useState([]);

  useEffect(() => {
    async function fetchPromos() {
      const { data } = await supabase
        .from("promotions")
        .select("*")
        .eq("is_active", true);

      setPromos(data || []);
    }

    fetchPromos();
  }, []);

  return (
    <div className="space-y-3">
      {promos.map((promo) => (
        <div key={promo.id} className="bg-white border p-3 rounded-xl">
          <p className="font-bold text-sm">{promo.title}</p>
          <p className="text-xs text-slate-500">{promo.description}</p>

          <button
            onClick={() => {
              setAppliedPromo(promo);
              setTab("order");
            }}
            className="mt-2 w-full py-2 bg-[#FC687D] text-white rounded-xl text-xs"
          >
            Use Promo
          </button>
        </div>
      ))}
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
            <p className="font-normal text-slate-800 text-base md:text-lg">
              {user?.email}
            </p>
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
        {tab === "order" && <OrderTab />}
        {tab === "loyalty" && <LoyaltyTab member={member} setMember={setMember} user={user} />}
        {tab === "booking" && <BookingTab user={user} member={member} />}
        {tab === "profile" && <ProfileTab user={user} onLogout={logout} />}
      </main>

      <TabBar tab={tab} setTab={setTab} />
    </div>
  );
}