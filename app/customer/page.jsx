"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BookingTab from "@/components/BookingForm";

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

function genMemberId() {
  const n = String(Math.floor(Math.random() * 999999) + 1).padStart(6, "0");
  return `JUJA${new Date().getFullYear()}${n}`; // Matching your JUJA2025... format
}

// ─── BOTTOM TAB BAR ───────────────────────────────────────────────────────────
function TabBar({ tab, setTab }) {
  const tabs = [
    { id: "home",    icon: "🏠", label: "Home" },
    { id: "order",   icon: "🛍️", label: "Order" },
    { id: "loyalty", icon: "⭐", label: "Loyalty" },
    { id: "booking", icon: "🎪", label: "Book Room" },
    { id: "profile", icon: "👤", label: "Profile" },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-rose-50 pb-safe shadow-[0_-4px_24px_rgba(252,104,125,0.05)]">
      <div className="max-w-md mx-auto grid grid-cols-5 px-2">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex flex-col items-center justify-center py-3 gap-1 transition-all duration-300 ${
              tab === t.id ? "text-[#FC687D]" : "text-slate-400 hover:text-slate-600"
            }`}>
            <span className={`text-[22px] leading-none transition-transform duration-300 ${tab === t.id ? "scale-110 -translate-y-1" : ""}`}>{t.icon}</span>
            <span className={`text-[9px] font-bold uppercase tracking-widest ${tab === t.id ? "text-[#FC687D]" : "text-slate-400"}`}>{t.label}</span>
            {tab === t.id && <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-[#FC687D]" />}
          </button>
        ))}
      </div>
    </nav>
  );
}

// ─── TOP HEADER ───────────────────────────────────────────────────────────────
function TopHeader({ user, onLogout }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-rose-50 shadow-sm">
      <div className="max-w-md mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/">
          <img src={LOGO} alt="Juja" className="h-10 w-auto object-contain transition-transform hover:scale-105" />
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-slate-500 text-[11px] font-bold hidden sm:block truncate max-w-[140px]">{user?.email}</span>
          <button onClick={onLogout}
            className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-full border border-slate-200 text-slate-500 hover:border-[#FC687D] hover:text-[#FC687D] hover:bg-rose-50 transition-all shadow-sm">
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}

// ─── HOME DASHBOARD ───────────────────────────────────────────────────────────
function HomeTab({ member, user, setTab }) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Hero welcome card */}
      <div className="bg-white rounded-[32px] p-6 border border-rose-100 shadow-[0_8px_30px_rgba(252,104,125,0.06)] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 pointer-events-none opacity-20"
          style={{ background: "radial-gradient(circle,#FC687D,transparent 65%)", filter: "blur(40px)" }} />
        
        <div className="relative z-10">
          <p className="text-[#FC687D] text-[10px] font-black uppercase tracking-[0.25em] mb-1">Welcome back 👋</p>
          <h2 className="text-3xl font-extrabold text-slate-800 leading-tight mb-1 tracking-tight">
            {member?.customer_name || user?.user_metadata?.full_name || "Coffee Lover"}
          </h2>
          {member?.customer_code && (
            <p className="text-slate-400 text-xs font-mono tracking-wider font-bold">{member.customer_code}</p>
          )}

          {member && (
            <div className="flex gap-6 mt-6 bg-[#FFF9FA] p-4 rounded-3xl border border-rose-50 inline-flex">
              <div>
                <p className="text-[#FC687D] font-black text-2xl leading-none">{parseFloat(member.points_balance || 0).toFixed(0)}</p>
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mt-1">Points</p>
              </div>
              <div className="w-px bg-rose-100" />
              <div>
                <p className="text-slate-800 font-black text-2xl leading-none">{member.total_visits || 0}</p>
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mt-1">Visits</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick action grid */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { icon: "🛍️", label: "Order Food", sub: "Browse full menu", tab: "order" },
          { icon: "⭐", label: "Loyalty", sub: "Points & rewards", tab: "loyalty" },
          { icon: "🎪", label: "Book Room", sub: "Function room", tab: "booking" },
          { icon: "🎁", label: "Promos", sub: "Deals & offers", href: "/promo" },
        ].map(c => (
          c.href
            ? <Link key={c.label} href={c.href}
                className="bg-white rounded-[24px] p-5 border border-rose-50 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                <div className="text-3xl mb-3 bg-rose-50 w-12 h-12 rounded-full flex items-center justify-center">{c.icon}</div>
                <p className="font-extrabold text-slate-800 text-[15px]">{c.label}</p>
                <p className="text-slate-500 text-[11px] font-medium mt-1">{c.sub}</p>
              </Link>
            : <button key={c.label} onClick={() => setTab(c.tab)}
                className="bg-white rounded-[24px] p-5 border border-rose-50 shadow-sm text-left hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                <div className="text-3xl mb-3 bg-rose-50 w-12 h-12 rounded-full flex items-center justify-center text-[#FC687D]">{c.icon}</div>
                <p className="font-extrabold text-slate-800 text-[15px]">{c.label}</p>
                <p className="text-slate-500 text-[11px] font-medium mt-1">{c.sub}</p>
              </button>
        ))}
      </div>

      {/* Not enrolled nudge */}
      {!member && (
        <button onClick={() => setTab("loyalty")}
          className="w-full rounded-[24px] p-6 text-center border-2 border-dashed border-rose-200 bg-[#FFF9FA] hover:bg-rose-50 transition-all duration-300 group">
          <p className="text-3xl mb-2 group-hover:scale-110 transition-transform">⭐</p>
          <p className="font-extrabold text-[#FC687D] text-[15px]">Join the Loyalty Program</p>
          <p className="text-slate-500 text-xs mt-1 font-medium">Earn points on every visit to unlock free food!</p>
        </button>
      )}

      {/* Store info strip */}
      <div className="bg-white rounded-[24px] p-6 border border-rose-50 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Visit Us</p>
        <div className="space-y-3 text-[13px] text-slate-600 font-medium">
          <p className="flex gap-3"><span>📍</span>36D Visayas Ave., Pasong Tamo, QC</p>
          <p className="flex gap-3"><span>📞</span>0939-9228383</p>
          <p className="flex gap-3 items-start"><span>🕙</span><span>Store: 10AM – 12MN<br/><span className="text-slate-400 text-xs">Room: 10AM – 2AM</span></span></p>
        </div>
      </div>
    </div>
  );
}

// ─── LOYALTY TAB ─────────────────────────────────────────────────────────────
function LoyaltyTab({ member, setMember, user }) {
  const [joining, setJoining] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ customer_name: "", phone: "", address: "", note: "" });
  const [saving, setSaving] = useState(false);

  const join = async () => {
    setJoining(true);
    try {
      const payload = {
        customer_name: user?.user_metadata?.full_name || "",
        email: user?.email || "",
        phone: "", 
        address: "", 
        note: "", // Used for birthday/notes
        customer_code: genMemberId(),
        points_balance: 0, 
        total_visits: 0,
        last_visit: new Date().toISOString().split("T")[0],
        user_id: user?.id,
      };
      
      const { data, error } = await supabase.from("loyalty_members").insert([payload]).select();
      if (!error && data) setMember(data[0]);
    } catch (e) { console.error(e); }
    setJoining(false);
  };

  const startEdit = () => {
    setForm({ 
      customer_name: member.customer_name || "", 
      phone: member.phone || "", 
      address: member.address || "", 
      note: member.note || "" 
    });
    setEditing(true);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.from("loyalty_members").update(form).eq("id", member.id);
      if (!error) {
        setMember(m => ({ ...m, ...form }));
        setEditing(false);
      }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  // ── Not enrolled ──
  if (!member) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h2 className="text-[28px] font-extrabold text-slate-800 tracking-tight">Loyalty Program</h2>
          <p className="text-slate-500 text-sm mt-1 font-medium">Earn points on every purchase</p>
        </div>
        <div className="bg-white rounded-[32px] border border-rose-50 shadow-sm p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-full blur-3xl" />
          <div className="text-6xl mb-6 relative z-10">⭐</div>
          <h3 className="text-2xl font-extrabold text-slate-800 mb-2 relative z-10">Join Juja Rewards</h3>
          <p className="text-slate-500 text-[13px] leading-relaxed mb-8 max-w-xs mx-auto font-medium relative z-10">
            Earn points with every visit, unlock free items, and celebrate your birthday in style!
          </p>
          <div className="text-left space-y-4 mb-8 bg-[#FFF9FA] p-6 rounded-[24px] relative z-10 border border-rose-50">
            {[
              ["🌟", "1 point per ₱10 spent"],
              ["🎁", "100 pts = free reward item"],
              ["🎂", "Birthday month double points"],
              ["📲", "Show member ID at checkout"],
            ].map(([ic, t]) => (
              <div key={t} className="flex gap-4 items-center text-[13px] font-bold text-slate-700">
                <span className="text-xl">{ic}</span><span>{t}</span>
              </div>
            ))}
          </div>
          <button onClick={join} disabled={joining}
            className="w-full py-4 rounded-full font-bold text-[13px] uppercase tracking-widest text-white transition-all bg-[#FC687D] hover:bg-rose-500 shadow-[0_8px_20px_rgba(252,104,125,0.3)] hover:-translate-y-0.5 disabled:opacity-50 relative z-10">
            {joining ? "Creating account…" : "Join For Free →"}
          </button>
        </div>
      </div>
    );
  }

  // ── Loyalty Card ──
  const pts = parseFloat(member.points_balance) || 0;
  const progress = (pts % 100) / 100 * 100;
  const nextReward = Math.ceil((pts + 0.01) / 100) * 100;

  const fmtBirthday = (val) => {
    if (!val) return "";
    try {
      const d = new Date(val + "T00:00:00");
      if (isNaN(d.getTime())) return val; // Fallback if they entered text instead of a date
      return `${d.getFullYear()}-${d.toLocaleString("en", { month: "short" })}-${String(d.getDate()).padStart(2, "0")}`;
    } catch { return val; }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-[28px] font-extrabold text-slate-800 tracking-tight">Juja Card</h2>
        <p className="text-slate-500 text-sm mt-1 font-medium">Digital Rewards Member</p>
      </div>

      {/* ── PREMIUM PINK LOYALTY CARD ── */}
      <div className="rounded-[32px] overflow-hidden shadow-[0_20px_40px_rgba(252,104,125,0.2)]"
        style={{ background: "linear-gradient(135deg, #FC687D 0%, #f43f5e 100%)" }}>
        
        <div className="px-6 pt-8 pb-6 text-center border-b border-white/20 relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
          <div className="w-20 h-20 rounded-[24px] mx-auto mb-4 flex items-center justify-center text-4xl bg-white/20 border border-white/30 backdrop-blur-md shadow-inner">
            👤
          </div>
          <h3 className="text-2xl font-extrabold text-white tracking-tight">{member.customer_name || "Juja Member"}</h3>
        </div>

        <div className="px-6 py-6 space-y-5 border-b border-white/20 bg-black/5">
          {[
            { icon: "📞", value: member.phone || "—" },
            { icon: "📍", value: member.address || "—" },
            { icon: "▦", value: member.customer_code, mono: true },
            { icon: "🎂", value: fmtBirthday(member.note) || "—" }, // We use note for birthdays based on CSV
          ].map(({ icon, value, mono }) => (
            <div key={icon} className="flex items-center gap-4">
              <span className="text-xl text-white/60 w-7 text-center">{icon}</span>
              <span className={`text-white text-[15px] ${mono ? "font-mono tracking-widest font-bold" : "font-semibold"}`}>
                {value}
              </span>
            </div>
          ))}
        </div>

        <div className="px-6 pt-6 pb-8 flex justify-between items-center bg-black/10">
          <button onClick={startEdit} className="text-[11px] font-black uppercase tracking-[0.25em] text-white/80 hover:text-white transition bg-white/10 px-5 py-2.5 rounded-full border border-white/20">
            Edit Profile
          </button>
          <div className="text-right">
            <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest mb-1">Total Points</p>
            <p className="text-3xl font-black text-white">{pts.toFixed(0)}</p>
          </div>
        </div>
      </div>

      {/* Points progress */}
      <div className="bg-white rounded-[24px] p-6 border border-rose-50 shadow-sm">
        <div className="flex justify-between items-end mb-4">
          <p className="font-extrabold text-slate-800 text-[15px]">Points Progress</p>
          <p className="text-xs font-bold text-slate-400">{pts.toFixed(0)} / {nextReward} pts</p>
        </div>
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden mb-3 border border-slate-200">
          <div className="h-full rounded-full transition-all duration-1000 bg-[#FC687D]" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-[11px] font-bold text-slate-500">{(nextReward - pts).toFixed(0)} more points until your next free reward 🎁</p>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-end" onClick={() => setEditing(false)}>
          <div className="w-full max-w-md mx-auto bg-white rounded-t-[32px] p-8 pb-12 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-full duration-300 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6" />
            <h3 className="text-xl font-extrabold text-slate-800 mb-6">Edit Profile</h3>
            <form onSubmit={saveEdit} className="space-y-5">
              {[
                ["customer_name", "Full Name", "text", "Your full name"],
                ["phone", "Phone Number", "tel", "09XX XXX XXXX"],
                ["address", "Location / City", "text", "e.g. QC, Metro Manila"],
                ["note", "Birthday (YYYY-MM-DD)", "text", "1995-12-25"],
              ].map(([key, lbl, type, ph]) => (
                <div key={key}>
                  <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-1">{lbl}</label>
                  <input type={type} value={form[key]} placeholder={ph}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-[#FC687D] focus:bg-white focus:ring-1 focus:ring-[#FC687D] transition-all" />
                </div>
              ))}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setEditing(false)}
                  className="flex-1 py-4 rounded-full bg-slate-100 text-slate-600 font-bold text-[13px] hover:bg-slate-200 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-4 rounded-full font-bold text-[13px] text-white transition-all bg-[#FC687D] hover:bg-rose-500 shadow-[0_8px_20px_rgba(252,104,125,0.3)] hover:-translate-y-0.5 disabled:opacity-60">
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ORDER TAB ────────────────────────────────────────────────────────────────
function OrderTab({ user }) {
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [cart, setCart] = useState({});
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState("menu");
  const [form, setForm] = useState({ customer_name: "", customer_phone: "", order_type: "Dine-In", delivery_address: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState(null);
  const tabsRef = useRef(null);

  useEffect(() => {
    async function fetchMenu() {
      const [itemRes, catRes] = await Promise.all([
        supabase.from("menu_items").select("*").eq("is_available", true),
        supabase.from("menu_categories").select("*").eq("is_active", true).order("sort_order")
      ]);
      
      if (itemRes.data) setItems(itemRes.data);
      if (catRes.data) {
        setCats(catRes.data);
        if (catRes.data.length > 0) setActiveTab(catRes.data[0].name);
      }
      setLoading(false);
    }
    fetchMenu();
  }, []);

  const activeCat = cats.find(c => c.name === activeTab);
  const filtered = items.filter(i => i.category === activeTab);
  const cartArr = Object.values(cart);
  const total = cartArr.reduce((s, e) => s + e.price * e.qty, 0);
  const count = cartArr.reduce((s, e) => s + e.qty, 0);

  const add = (item) => setCart(c => ({
    ...c, [item.id]: c[item.id]
      ? { ...c[item.id], qty: c[item.id].qty + 1 }
      : { id: item.id, name: item.name, price: item.price, qty: 1 }
  }));
  
  const remove = (id) => setCart(c => {
    const n = { ...c };
    if (n[id]?.qty > 1) n[id] = { ...n[id], qty: n[id].qty - 1 };
    else delete n[id];
    return n;
  });

  const placeOrder = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        customer_email: user?.email || "",
        items: cartArr, 
        total_amount: total,
        status: "Pending",
        payment_status: "Unpaid",
      };
      
      const { data, error } = await supabase.from("orders").insert([payload]).select();
      if (!error && data) {
        setOrderId(data[0].id);
        setStep("done");
        setCart({});
      } else {
        alert("Failed to place order. Please check if the 'orders' table has INSERT RLS policies enabled.");
      }
    } catch (e) { console.error(e); }
    setSubmitting(false);
  };

  // ── ORDER COMPLETE ──
  if (step === "done") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-6 animate-in zoom-in-95 duration-500">
        <div className="text-8xl mb-2 drop-shadow-sm">🎉</div>
        <div>
          <h2 className="text-[28px] font-extrabold text-slate-800 tracking-tight">Order Placed!</h2>
          <p className="text-slate-500 text-[15px] max-w-xs mx-auto mt-2 font-medium">Your order is being prepared. Thank you for choosing Juja!</p>
        </div>
        <div className="bg-white px-6 py-3 rounded-2xl border border-rose-50 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Order Reference</p>
          <p className="text-slate-800 font-mono font-bold text-lg">#{String(orderId).slice(-8).toUpperCase()}</p>
        </div>
        <button onClick={() => setStep("menu")}
          className="mt-6 px-10 py-4 rounded-full font-bold text-[13px] uppercase tracking-widest text-white transition-all bg-[#FC687D] hover:bg-rose-500 shadow-[0_8px_20px_rgba(252,104,125,0.3)] hover:-translate-y-0.5">
          Order Again →
        </button>
      </div>
    );
  }

  // ── CHECKOUT ──
  if (step === "checkout") {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
        <div className="flex items-center gap-4">
          <button onClick={() => setStep("menu")} className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-slate-200 text-slate-500 hover:text-[#FC687D] hover:border-[#FC687D] shadow-sm transition-colors font-bold text-lg pb-1">←</button>
          <div>
            <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">Checkout</h2>
            <p className="text-slate-500 text-xs font-bold">{count} items · <span className="text-[#FC687D]">₱{total.toLocaleString()}</span></p>
          </div>
        </div>

        {/* Cart items */}
        <div className="bg-white rounded-[24px] border border-rose-50 shadow-sm divide-y divide-rose-50 overflow-hidden">
          {cartArr.map(item => (
            <div key={item.id} className="flex items-center justify-between p-5 gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-slate-800 text-sm truncate">{item.name}</p>
                <p className="text-slate-400 text-xs font-bold mt-0.5">₱{item.price} × {item.qty}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 bg-slate-50 p-1.5 rounded-full border border-slate-100">
                <button onClick={() => remove(item.id)} className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-slate-600 font-bold hover:text-rose-500 shadow-sm transition-colors">−</button>
                <span className="font-black text-sm w-4 text-center text-slate-700">{item.qty}</span>
                <button onClick={() => add({ id: item.id, name: item.name, price: item.price })} className="w-7 h-7 rounded-full bg-[#FC687D] flex items-center justify-center text-white font-bold shadow-sm transition-colors">+</button>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={placeOrder} className="space-y-5 bg-white p-6 rounded-[32px] border border-rose-50 shadow-sm">
          {[
            ["customer_name", "Your Name", "text", "Full name", true],
            ["customer_phone", "Phone", "tel", "09XX XXX XXXX", true],
          ].map(([k, l, t, p, req]) => (
            <div key={k}>
              <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-1">{l}</label>
              <input type={t} required={req} value={form[k]} placeholder={p}
                onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-[#FC687D] focus:bg-white transition-all" />
            </div>
          ))}

          <div>
            <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-1">Order Type</label>
            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
              {["Dine-In", "Take-Out", "Delivery"].map(t => (
                <button key={t} type="button" onClick={() => setForm(f => ({ ...f, order_type: t }))}
                  className={`py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all ${
                    form.order_type === t ? "bg-white text-[#FC687D] shadow-sm border border-rose-100" : "text-slate-500 hover:text-slate-700"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {form.order_type === "Delivery" && (
            <div className="animate-in fade-in slide-in-from-top-2">
              <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-1">Delivery Address</label>
              <textarea required rows={2} value={form.delivery_address}
                onChange={e => setForm(f => ({ ...f, delivery_address: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-[#FC687D] focus:bg-white transition-all resize-none"
                placeholder="Full delivery address" />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-1">Notes (optional)</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-[#FC687D] focus:bg-white transition-all"
              placeholder="Special requests…" />
          </div>

          <div className="bg-[#FFF9FA] rounded-2xl px-6 py-4 flex justify-between items-center border border-rose-100 mt-6">
            <span className="font-extrabold text-slate-800 text-[15px]">Total Amount</span>
            <span className="font-black text-[#FC687D] text-2xl">₱{total.toLocaleString()}</span>
          </div>

          <button type="submit" disabled={submitting}
            className="w-full py-4 mt-2 bg-[#FC687D] text-white rounded-full text-[13px] font-bold uppercase tracking-widest hover:bg-rose-500 transition-all shadow-[0_8px_20px_rgba(252,104,125,0.3)] hover:-translate-y-0.5 disabled:opacity-50">
            {submitting ? "Processing…" : "Place Order →"}
          </button>
        </form>
      </div>
    );
  }

  // ── MENU BROWSE ──
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between sticky top-16 z-30 bg-[#FFF5F7] pt-2 pb-4">
        <div>
          <h2 className="text-[28px] font-extrabold text-slate-800 tracking-tight">Menu</h2>
          <p className="text-slate-500 text-sm mt-0.5 font-medium">Pick your favorites</p>
        </div>
        {count > 0 && (
          <button onClick={() => setStep("checkout")}
            className="flex items-center gap-2 px-5 py-3 rounded-full text-[11px] font-bold uppercase tracking-widest text-white transition-all bg-[#FC687D] hover:bg-rose-500 shadow-[0_8px_20px_rgba(252,104,125,0.3)] hover:-translate-y-0.5">
            <span className="text-base">🛒</span> {count} · ₱{total.toLocaleString()}
          </button>
        )}
      </div>

      {/* Category pill tabs */}
      <div ref={tabsRef} className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 pt-1 -mx-4 px-4 sticky top-[110px] z-20 bg-[#FFF5F7]">
        {loading
          ? [...Array(5)].map((_, i) => <div key={i} className="w-28 h-10 bg-white border border-rose-50 rounded-full animate-pulse flex-shrink-0" />)
          : cats.map(cat => (
            <button key={cat.id} onClick={() => setActiveTab(cat.name)}
              className={`flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all duration-300 shadow-sm border ${
                activeTab === cat.name ? "bg-[#FC687D] text-white border-[#FC687D]" : "bg-white text-slate-500 border-rose-100 hover:text-[#FC687D] hover:border-[#FC687D]"
              }`}>
              <span className="text-base">{cat.icon}</span> {cat.name}
            </button>
          ))
        }
      </div>

      {/* Items grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-48 bg-white border border-rose-50 rounded-[24px] animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {filtered.map(item => {
            const inCart = cart[item.id]?.qty || 0;
            return (
              <div key={item.id} className="bg-white rounded-[24px] border border-rose-50 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                {item.image_url
                  ? <div className="h-32 overflow-hidden m-2 rounded-2xl relative">
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                  : <div className="h-28 m-2 rounded-2xl flex items-center justify-center text-5xl opacity-20 bg-slate-50 border border-slate-100">
                      {activeCat?.icon || "🍽"}
                    </div>
                }
                <div className="px-3 pb-3 pt-1 flex flex-col flex-1">
                  <p className="font-extrabold text-slate-800 text-[13px] leading-tight mb-1">{item.name}</p>
                  <p className="font-black text-[#FC687D] text-[15px] mb-3">₱{item.price}</p>
                  
                  <div className="mt-auto">
                    {inCart > 0 ? (
                      <div className="flex items-center justify-between bg-slate-50 p-1 rounded-xl border border-slate-200">
                        <button onClick={() => remove(item.id)} className="w-8 h-8 rounded-[10px] bg-white flex items-center justify-center text-slate-600 font-bold hover:text-rose-500 shadow-sm">−</button>
                        <span className="font-black text-[13px] text-slate-700">{inCart}</span>
                        <button onClick={() => add(item)} className="w-8 h-8 rounded-[10px] bg-[#FC687D] flex items-center justify-center text-white font-bold shadow-sm">+</button>
                      </div>
                    ) : (
                      <button onClick={() => add(item)}
                        className="w-full py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest text-[#FC687D] bg-[#FFF9FA] border border-rose-100 hover:bg-[#FC687D] hover:text-white transition-colors">
                        Add to Cart
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && !loading && (
            <div className="col-span-2 text-center py-16 bg-white rounded-[32px] border border-dashed border-rose-200">
              <p className="text-5xl mb-4 opacity-20">{activeCat?.icon}</p>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No items in this category</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── BOOKING TAB ──────────────────────────────────────────────────────────────
function BookingTab({ user, member }) {
  const [bookings, setBookings] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    customer_name: member?.customer_name || user?.user_metadata?.full_name || "",
    customer_email: user?.email || "",
    customer_phone: member?.phone || "",
    event_type: "", event_date: "", start_time: "", end_time: "",
    guest_count: "", notes: "",
  });

  useEffect(() => {
    if (user?.id) {
      supabase.from("room_bookings").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
        .then(({ data }) => setBookings(data || []))
        .finally(() => setLoading(false));
    } else setLoading(false);
  }, [user]);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        guest_count: parseInt(form.guest_count) || 0,
        status: "Pending",
        user_id: user?.id,
      };
      const { data, error } = await supabase.from("room_bookings").insert([payload]).select();
      if (!error && data) {
        setBookings(prev => [data[0], ...prev]);
        setShowForm(false);
        setSuccess(true);
        setForm(f => ({ ...f, event_type: "", event_date: "", start_time: "", end_time: "", guest_count: "", notes: "" }));
        setTimeout(() => setSuccess(false), 5000);
      } else {
         alert("Failed to submit booking. Check your table policies.");
      }
    } catch (e) { console.error(e); }
    setSubmitting(false);
  };

  const statusStyle = {
    Pending:   "bg-amber-100 text-amber-700 border-amber-200",
    Confirmed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Cancelled: "bg-red-100 text-red-600 border-red-200",
    Completed: "bg-slate-100 text-slate-500 border-slate-200",
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[28px] font-extrabold text-slate-800 tracking-tight">Book Room</h2>
          <p className="text-slate-500 text-sm mt-0.5 font-medium">Function room reservations</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="text-[11px] font-bold uppercase tracking-widest px-5 py-3 rounded-full text-white transition-all bg-[#FC687D] hover:bg-rose-500 shadow-[0_4px_15px_rgba(252,104,125,0.3)] hover:-translate-y-0.5">
          + Book Now
        </button>
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-[24px] p-5 flex items-center gap-4 animate-in slide-in-from-top-2 shadow-sm">
          <span className="text-3xl bg-white w-12 h-12 rounded-full flex items-center justify-center shadow-sm">✅</span>
          <div>
            <p className="font-extrabold text-emerald-800 text-[15px]">Booking Submitted!</p>
            <p className="text-emerald-600 text-[13px] font-medium mt-0.5">We'll confirm your reservation within 24 hours.</p>
          </div>
        </div>
      )}

      {/* Info card */}
      <div className="rounded-[32px] p-6 border border-rose-50 bg-white shadow-sm flex gap-5 items-center">
        <div className="w-16 h-16 rounded-full bg-[#FFF9FA] border border-rose-100 flex items-center justify-center text-3xl flex-shrink-0">🎪</div>
        <div>
          <p className="font-extrabold text-slate-800 text-[15px]">The Function Room</p>
          <p className="text-slate-500 text-[11px] mt-1 font-medium leading-relaxed">Perfect for birthdays, team outings, corporate events & more.</p>
          <p className="text-[#FC687D] text-[10px] font-bold uppercase tracking-widest mt-2 bg-rose-50 inline-block px-3 py-1 rounded-full border border-rose-100">🕙 Available 10AM – 2AM</p>
        </div>
      </div>

      {/* Bookings history */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4 px-2">Your Reservations</p>
        {loading ? (
          <div className="space-y-4">{[1, 2].map(i => <div key={i} className="h-24 bg-white rounded-[24px] border border-rose-50 animate-pulse" />)}</div>
        ) : bookings.length === 0 ? (
          <div className="bg-white rounded-[32px] p-10 border border-dashed border-rose-200 text-center">
            <p className="text-5xl mb-4 opacity-20">📅</p>
            <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">No bookings yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map(b => (
              <div key={b.id} className="bg-white rounded-[24px] p-5 border border-rose-50 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-extrabold text-slate-800 text-[15px]">{b.event_type || "Event"}</p>
                    <p className="text-slate-500 text-xs mt-1 font-medium">
                      <span className="font-bold text-slate-700">{b.event_date}</span> · {b.start_time}–{b.end_time}
                    </p>
                  </div>
                  <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${statusStyle[b.status] || statusStyle.Pending}`}>
                    {b.status}
                  </span>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center justify-between">
                  <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">👥 {b.guest_count} guests</p>
                  {b.notes && <p className="text-slate-400 text-xs italic truncate max-w-[150px]">"{b.notes}"</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Booking form bottom sheet */}
      {showForm && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-end" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md mx-auto bg-white rounded-t-[32px] max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom-full duration-300 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm px-8 pt-6 pb-4 border-b border-rose-50 z-10">
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-5" />
              <h3 className="text-xl font-extrabold text-slate-800">Reserve Room</h3>
              <p className="text-slate-500 text-xs mt-1 font-medium">Fill in your event details below</p>
            </div>
            <form onSubmit={submit} className="p-8 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                {[
                  ["customer_name", "Your Name", "text", "Full name"],
                  ["customer_phone", "Phone", "tel", "09XX XXX XXXX"],
                ].map(([k, l, t, p]) => (
                  <div key={k}>
                    <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-1">{l}</label>
                    <input type={t} required value={form[k]} placeholder={p}
                      onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#FC687D] focus:bg-white transition-all" />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-1">Event Type</label>
                <select required value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#FC687D] focus:bg-white transition-all appearance-none">
                  <option value="">— Select event type —</option>
                  {["Birthday Party","Debut","Graduation Party","Corporate Event","Team Building","Family Gathering","Others"].map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-1">Event Date</label>
                <input type="date" required value={form.event_date} min={new Date().toISOString().split("T")[0]}
                  onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#FC687D] focus:bg-white transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[["start_time","Start Time"],["end_time","End Time"]].map(([k,l]) => (
                  <div key={k}>
                    <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-1">{l}</label>
                    <input type="time" required value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#FC687D] focus:bg-white transition-all" />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-1">Number of Guests</label>
                <input type="number" required min="1" value={form.guest_count}
                  onChange={e => setForm(f => ({ ...f, guest_count: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#FC687D] focus:bg-white transition-all"
                  placeholder="How many guests?" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-1">Special Requests</label>
                <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#FC687D] focus:bg-white transition-all resize-none"
                  placeholder="Decorations, audio setup, special food, etc." />
              </div>
              <div className="flex gap-3 pt-2 pb-4">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-4 rounded-full bg-slate-100 text-slate-600 font-bold text-[13px] hover:bg-slate-200 transition-colors">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="flex-1 py-4 rounded-full font-bold text-[13px] text-white transition-all bg-[#FC687D] hover:bg-rose-500 shadow-[0_8px_20px_rgba(252,104,125,0.3)] hover:-translate-y-0.5 disabled:opacity-60">
                  {submitting ? "Submitting…" : "Submit Booking →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PROFILE TAB ─────────────────────────────────────────────────────────────
function ProfileTab({ user, member, setTab, onLogout }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-[28px] font-extrabold text-slate-800 tracking-tight">Profile</h2>
        <p className="text-slate-500 text-sm mt-0.5 font-medium">Your account details</p>
      </div>

      <div className="bg-white rounded-[32px] border border-rose-50 shadow-sm p-6">
        <div className="flex items-center gap-5 mb-6 pb-6 border-b border-rose-50">
          <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-3xl flex-shrink-0">👤</div>
          <div>
            <p className="font-extrabold text-slate-800 text-lg">{user?.user_metadata?.full_name || member?.customer_name || "Customer"}</p>
            <p className="text-slate-500 text-xs font-medium mt-0.5">{user?.email}</p>
            {member && <p className="text-[#FC687D] bg-rose-50 px-3 py-1 inline-block rounded-full border border-rose-100 text-[10px] font-bold uppercase tracking-widest mt-2">⭐ Loyalty Member</p>}
          </div>
        </div>

        <div className="space-y-4">
          {[
            ["📧", "Email Address", user?.email],
            ["📞", "Phone Number", member?.phone || "—"],
            ["📍", "Location / City", member?.address || "—"],
            ["▦",  "Member ID", member?.customer_code || "Not enrolled"],
            ["🎂", "Birthday", member?.note || "—"],
          ].map(([ic, lbl, val]) => (
            <div key={lbl} className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <span className="text-xl w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm flex-shrink-0">{ic}</span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{lbl}</p>
                <p className="text-slate-700 text-[13px] font-bold mt-0.5">{val}</p>
              </div>
            </div>
          ))}
        </div>

        {member && (
          <button onClick={() => setTab("loyalty")}
            className="mt-6 w-full py-3.5 rounded-full text-xs font-bold uppercase tracking-widest text-[#FC687D] border border-rose-200 bg-[#FFF9FA] hover:bg-[#FC687D] hover:text-white transition-all shadow-sm">
            Edit Loyalty Profile →
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link href="/menu" className="bg-white rounded-[24px] p-6 border border-rose-50 text-center hover:shadow-md transition-shadow">
          <p className="text-3xl mb-2 bg-rose-50 w-12 h-12 mx-auto rounded-full flex items-center justify-center">🍽</p>
          <p className="font-extrabold text-slate-800 text-[13px]">Full Menu</p>
        </Link>
        <Link href="/promo" className="bg-white rounded-[24px] p-6 border border-rose-50 text-center hover:shadow-md transition-shadow">
          <p className="text-3xl mb-2 bg-rose-50 w-12 h-12 mx-auto rounded-full flex items-center justify-center text-[#FC687D]">🎁</p>
          <p className="font-extrabold text-slate-800 text-[13px]">Promos</p>
        </Link>
      </div>

      <button onClick={onLogout}
        className="w-full py-4 rounded-full bg-white border border-slate-200 text-slate-500 font-bold text-[13px] uppercase tracking-widest hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 transition-all shadow-sm">
        Sign Out
      </button>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function Customer() {
  const [user, setUser] = useState(null);
  const [member, setMember] = useState(null);
  const [tab, setTab] = useState("home");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }
      
      setUser(session.user);
      
      // Fetch loyalty member data using the user's ID
      try {
        const { data } = await supabase.from("loyalty_members").select("*").eq("user_id", session.user.id).single();
        if (data) setMember(data);
      } catch (e) { console.warn("No loyalty member found:", e); }
      
      setLoading(false);
    }
    loadData();
  }, [router]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7]">
        <div className="text-center animate-in zoom-in-95 duration-500">
          <img src={LOGO} alt="Juja" className="h-24 w-auto object-contain mx-auto mb-6 animate-pulse" />
          <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28 pt-20" style={{ fontFamily: "'Inter',system-ui,sans-serif", background: "#FFF5F7" }}>
      <TopHeader user={user} onLogout={logout} />
      <div className="max-w-md mx-auto px-5 py-4 relative">
        {tab === "home"    && <HomeTab    member={member} user={user} setTab={setTab} />}
        {tab === "order"   && <OrderTab   user={user} />}
        {tab === "loyalty" && <LoyaltyTab member={member} setMember={setMember} user={user} />}
        {tab === "booking" && <BookingTab user={user} member={member} />}
        {tab === "profile" && <ProfileTab user={user} member={member} setTab={setTab} onLogout={logout} />}
      </div>
      <TabBar tab={tab} setTab={setTab} />
    </div>
// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function Customer() {
  const [user, setUser] = useState(null);
  const [member, setMember] = useState(null);
  const [tab, setTab] = useState("home");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }
      
      setUser(session.user);
      
      try {
        const { data } = await supabase.from("loyalty_members").select("*").eq("user_id", session.user.id).single();
        if (data) setMember(data);
      } catch (e) { console.warn("No loyalty member found:", e); }
      
      setLoading(false);
    }
    loadData();
  }, [router]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7]">
        <div className="text-center animate-in zoom-in-95 duration-500">
          <img src={LOGO} alt="Juja" className="h-24 w-auto object-contain mx-auto mb-6 animate-pulse" />
          <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28 pt-20" style={{ fontFamily: "'Inter',system-ui,sans-serif", background: "#FFF5F7" }}>
      {/* 1. Header is always visible */}
      <TopHeader user={user} onLogout={logout} />
      
      {/* 2. Main Content Area depends on the selected Tab */}
      <div className="max-w-md mx-auto px-5 py-4 relative">
        {tab === "home"    && <HomeTab    member={member} user={user} setTab={setTab} />}
        {tab === "order"   && <OrderTab   user={user} />}
        {tab === "loyalty" && <LoyaltyTab member={member} setMember={setMember} user={user} />}
        
        {/* We use your built-in BookingTab here which contains the form logic */}
        {tab === "booking" && <BookingTab user={user} member={member} />}
        
        {tab === "profile" && <ProfileTab user={user} member={member} setTab={setTab} onLogout={logout} />}
      </div>

      {/* 3. Bottom Navigation is always visible */}
      <TabBar tab={tab} setTab={setTab} />
    </div>
  );
}