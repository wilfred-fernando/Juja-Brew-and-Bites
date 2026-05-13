"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BookingTab from "@/components/BookingForm"; // Keeping your externalized booking form
import Barcode from "react-barcode";
import Image from "next/image";

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

function genMemberId() {
  const n = String(Math.floor(Math.random() * 999999) + 1).padStart(6, "0");
  return `JUJA${new Date().getFullYear()}${n}`;
}

// ─── BOTTOM TAB BAR (Mobile Optimized) ────────────────────────────────────────
function TabBar({ tab, setTab }) {
  const tabs = [
    { id: "home",    icon: "🏠", label: "Home" },
    { id: "order",   icon: "🛍️", label: "Order" },
    { id: "loyalty", icon: "⭐", label: "Loyalty" },
    { id: "booking", icon: "🎪", label: "Book" },
    { id: "profile", icon: "👤", label: "Profile" },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-rose-50 pb-safe shadow-[0_-4px_24px_rgba(252,104,125,0.05)]">
      <div className="max-w-md mx-auto grid grid-cols-5 px-1 md:px-2">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex flex-col items-center justify-center py-2.5 md:py-3 gap-0.5 md:gap-1 transition-all duration-300 active:scale-90 ${
              tab === t.id ? "text-[#FC687D]" : "text-slate-400 hover:text-slate-600"
            }`}>
            <span className={`text-[20px] md:text-[22px] leading-none transition-transform duration-300 ${tab === t.id ? "scale-110 -translate-y-1" : ""}`}>{t.icon}</span>
            <span className={`text-[8px] md:text-[9px] font-normal uppercase tracking-widest ${tab === t.id ? "text-[#FC687D]" : "text-slate-400"}`}>{t.label}</span>
            {tab === t.id && <span className="absolute bottom-1 w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-[#FC687D]" />}
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
      <div className="max-w-md mx-auto px-4 md:px-6 h-14 md:h-16 flex items-center justify-between">
        <Link href="/">
          <img src={LOGO} alt="Juja" className="h-8 md:h-10 w-auto object-contain transition-transform hover:scale-105 active:scale-95" />
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-slate-500 text-[10px] md:text-[11px] font-bold hidden sm:block truncate max-w-[140px]">{user?.email}</span>
        </div>
      </div>
    </header>
  );
}

// ─── HOME DASHBOARD ───────────────────────────────────────────────────────────
function HomeTab({ member, user, setTab }) {
  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Hero Welcome Card */}
      <div className="bg-white rounded-2xl md:rounded-[32px] p-5 md:p-6 border border-rose-100 shadow-[0_4px_20px_rgba(252,104,125,0.06)] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 md:w-48 md:h-48 pointer-events-none opacity-20"
          style={{ background: "radial-gradient(circle,#FC687D,transparent 65%)", filter: "blur(40px)" }} />
        
        <div className="relative z-10">
          <p className="text-[#FC687D] text-[9px] md:text-[10px] font-normal uppercase tracking-[0.25em] mb-1">Welcome back 👋</p>
          <h2 className="text-2xl md:text-3xl font-normal text-slate-800 leading-tight mb-1 tracking-tight">
            {member?.customer_name || user?.user_metadata?.full_name || "Coffee Lover"}
          </h2>
          {member?.customer_code && (
            <p className="text-slate-400 text-[10px] md:text-xs font-mono tracking-wider font-normal">{member.customer_code}</p>
          )}

          {member && (
            <div className="flex gap-4 md:gap-6 mt-4 md:mt-6 bg-[#FFF9FA] p-3 md:p-4 rounded-xl md:rounded-2xl border border-rose-50 inline-flex">
              <div>
                <p className="text-[#FC687D] font-normal text-xl md:text-2xl leading-none">{parseFloat(member["Points balance"] || 0).toFixed(0)}</p>
                <p className="text-slate-500 text-[9px] md:text-[10px] uppercase font-normal tracking-widest mt-1">Points</p>
              </div>
              <div className="w-px bg-rose-100" />
              <div>
                <p className="text-slate-800 font-normal text-xl md:text-2xl leading-none">{member["Total visits"] || 0}</p>
                <p className="text-slate-500 text-[9px] md:text-[10px] uppercase font-normal tracking-widest mt-1">Visits</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Action Grid */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        {[
          { icon: "🛍️", label: "Order Food", sub: "Browse menu", tab: "order" },
          { icon: "⭐", label: "Loyalty", sub: "Rewards", tab: "loyalty" },
          { icon: "🎪", label: "Book Room", sub: "Function room", tab: "booking" },
          { icon: "🎁", label: "Promos", sub: "Deals & offers", href: "/promo" },
        ].map(c => (
          c.href
            ? <Link key={c.label} href={c.href}
                className="bg-white rounded-xl md:rounded-[24px] p-4 md:p-5 border border-rose-50 shadow-sm hover:shadow-md active:scale-95 transition-all duration-300">
                <div className="text-2xl md:text-3xl mb-2 md:mb-3 bg-rose-50 w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center">{c.icon}</div>
                <p className="font-normal text-slate-800 text-[13px] md:text-[15px]">{c.label}</p>
                <p className="text-slate-400 text-[9px] md:text-[11px] font-normal uppercase tracking-widest mt-0.5">{c.sub}</p>
              </Link>
            : <button key={c.label} onClick={() => setTab(c.tab)}
                className="bg-white rounded-xl md:rounded-[24px] p-4 md:p-5 border border-rose-50 shadow-sm text-left hover:shadow-md active:scale-95 transition-all duration-300">
                <div className="text-2xl md:text-3xl mb-2 md:mb-3 bg-rose-50 w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-[#FC687D]">{c.icon}</div>
                <p className="font-normal text-slate-800 text-[13px] md:text-[15px]">{c.label}</p>
                <p className="text-slate-400 text-[9px] md:text-[11px] font-normal uppercase tracking-widest mt-0.5">{c.sub}</p>
              </button>
        ))}
      </div>

      {/* Store Info */}
      <div className="bg-white rounded-xl md:rounded-[24px] p-5 border border-rose-50 shadow-sm">
        <p className="text-[9px] md:text-[10px] font-normal uppercase tracking-widest text-slate-400 mb-3">Visit Us</p>
        <div className="space-y-2.5 text-[11px] md:text-[13px] text-slate-600 font-normal">
          <p className="flex gap-3"><span>📍</span>36D Visayas Ave., Pasong Tamo, QC</p>
          <p className="flex gap-3"><span>📞</span>0939-9228383</p>
          <p className="flex gap-3 items-start"><span>🕙</span><span>Store: 10AM – 12MN<br/><span className="text-slate-400 text-[10px]">Room: 10AM – 2AM</span></span></p>
        </div>
      </div>
    </div>
  );
}

// ─── ORDER TAB (Refined Mobile View) ──────────────────────────────────────────
function OrderTab({ user }) {
  const [items, setItems] = useState([]);
  const [cats, setCategories] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [cart, setCart] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMenu() {
      const [itemRes, catRes] = await Promise.all([
        supabase.from("menu_items").select("*").eq("is_available", true).order("name"),
        supabase.from("menu_categories").select("*").eq("is_active", true).order("sort_order")
      ]);
      if (itemRes.data) setItems(itemRes.data);
      if (catRes.data) {
        setCategories(catRes.data);
        if (catRes.data.length > 0) setActiveTab(catRes.data[0].name);
      }
      setLoading(false);
    }
    fetchMenu();
  }, []);

  const filtered = items.filter(i => i.category === activeTab);
  const cartArr = Object.values(cart);
  const total = cartArr.reduce((s, e) => s + e.price * e.qty, 0);

  const add = (item) => setCart(c => ({
    ...c, [item.id]: c[item.id] ? { ...c[item.id], qty: c[item.id].qty + 1 } : { id: item.id, name: item.name, price: item.price, qty: 1 }
  }));

  const remove = (id) => setCart(c => {
    const n = { ...c };
    if (n[id]?.qty > 1) n[id] = { ...n[id], qty: n[id].qty - 1 };
    else delete n[id];
    return n;
  });

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
      
      {/* Categories (Smooth Horizontal Scroll) */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 pt-1 -mx-4 px-4 sticky top-[56px] md:top-[64px] z-20 bg-[#FFF5F7]">
        {cats.map(cat => (
          <button key={cat.id} onClick={() => setActiveTab(cat.name)}
            className={`flex-shrink-0 px-4 md:px-5 py-2 md:py-2.5 rounded-xl text-[10px] md:text-[11px] font-normal uppercase tracking-widest transition-all duration-300 active:scale-95 shadow-sm border ${
              activeTab === cat.name ? "bg-[#FC687D] text-white border-[#FC687D]" : "bg-white text-slate-500 border-rose-100"
            }`}>
            {cat.name}
          </button>
        ))}
      </div>

      {/* Grid of Items */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 pb-10">
        {filtered.map(item => {
          const inCart = cart[item.id]?.qty || 0;
          return (
            <div key={item.id} className="bg-white rounded-xl md:rounded-[24px] border border-rose-50 shadow-sm overflow-hidden flex flex-col p-2.5 md:p-3">
              <div className="h-24 md:h-32 rounded-lg md:rounded-xl bg-slate-50 flex items-center justify-center relative overflow-hidden mb-2 border border-slate-100">
                {item.image_url ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" /> : <span className="text-2xl text-slate-200">📷</span>}
              </div>
              
              <div className="flex flex-col flex-1 px-1">
                <p className="font-normal text-slate-800 text-[11px] md:text-[13px] leading-tight mb-1">{item.name}</p>
                <p className="font-normal text-[#FC687D] text-[13px] md:text-[15px] mb-3">₱{item.price}</p>
                
                <div className="mt-auto">
                  {inCart > 0 ? (
                    <div className="flex items-center justify-between bg-slate-50 p-1 rounded-lg border border-slate-200">
                      <button onClick={() => remove(item.id)} className="w-7 h-7 md:w-8 md:h-8 rounded-[6px] bg-white flex items-center justify-center text-slate-600 font-normal shadow-sm active:scale-90">−</button>
                      <span className="font-normal text-[12px] md:text-[13px] text-slate-700">{inCart}</span>
                      <button onClick={() => add(item)} className="w-7 h-7 md:w-8 md:h-8 rounded-[6px] bg-[#FC687D] flex items-center justify-center text-white font-normal shadow-sm active:scale-90">+</button>
                    </div>
                  ) : (
                    <button onClick={() => add(item)} className="w-full py-2 md:py-2.5 rounded-lg text-[9px] md:text-[11px] font-normal uppercase tracking-widest text-[#FC687D] bg-[#FFF9FA] border border-rose-100 hover:bg-[#FC687D] hover:text-white transition-all active:scale-95">
                      Add to Cart
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
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
  Email: user?.email || "",
  Phone: "",
  Address: "",
  Note: "",
  customer_code: genMemberId(),

  "Points balance": 0,
  "Total visits": 0,

  "Last visit": new Date().toISOString().split("T")[0],

  user_id: user?.id,
};
      
      const { data, error } = await supabase.from("loyalty_members").insert([payload]).select();
      if (!error && data) setMember(data[0]);
    } catch (e) { console.error(e); }
    setJoining(false);
  };

  const startEdit = () => {
    setForm({ 
      customer_name: member["customer_name"] || "", 
      phone: member["Phone"] || "",
      address: member["Address"] || "",
      note: member["Note"] || ""
    });
    setEditing(true);
  };

 const saveEdit = async (e) => {
  e.preventDefault();
  setSaving(true);

  try {
    const updateData = {
      customer_name: form.customer_name,
      phone: form.phone,
      address: form.address,
      note: form.note,
    };

    const { error } = await supabase
      .from("loyalty_members")
      .update(updateData)
      .eq("id", member.id);

    if (!error) {
      setMember(m => ({ ...m, ...updateData }));
      setEditing(false);
    }
  } catch (err) {
    console.error(err);
  }

  setSaving(false);
};

const submitLinkRequest = async () => {
  const { error } = await supabase.from("loyalty_link_requests").insert({
    user_id: user.id,
    full_name: form.customer_name,
    birthday: form.note, // or separate field
    status: "pending"
  });

  if (!error) {
    alert("Request sent for approval");
  }
};

  const fmtBirthday = (val) => {
    if (!val) return "";
    try {
      const d = new Date(val + "T00:00:00");
      if (isNaN(d.getTime())) return val; 
      return `${d.getFullYear()}-${d.toLocaleString("en", { month: "short" })}-${String(d.getDate()).padStart(2, "0")}`;
    } catch { return val; }
  };

  // ── Not enrolled ──
  if (!member) {
    return (
      <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h2 className="text-2xl md:text-[28px] font-normal text-slate-800 tracking-tight">Loyalty Program</h2>
          <p className="text-slate-500 text-xs md:text-sm mt-0.5 font-normal">Earn points on every purchase</p>
        </div>
        <div className="bg-white rounded-2xl md:rounded-[32px] border border-rose-50 shadow-sm p-6 md:p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-rose-50 rounded-full blur-3xl" />
          <div className="text-5xl md:text-6xl mb-4 md:mb-6 relative z-10 animate-bounce" style={{ animationDuration: '3s' }}>⭐</div>
          <h3 className="text-xl md:text-2xl font-normal text-slate-800 mb-2 relative z-10">Join Juja Rewards</h3>
          <p className="text-slate-500 text-[11px] md:text-[13px] leading-relaxed mb-6 md:mb-8 max-w-[250px] md:max-w-xs mx-auto font-normal relative z-10">
            Earn points with every visit, unlock free items, and celebrate your birthday in style!
          </p>
          <div className="text-left space-y-3 md:space-y-4 mb-6 md:mb-8 bg-[#FFF9FA] p-4 md:p-6 rounded-xl md:rounded-[24px] relative z-10 border border-rose-50">
            {[
              ["🌟", "1 point per ₱10 spent"],
              ["🎁", "100 pts = free reward item"],
              ["🎂", "Birthday month double points"],
              ["📲", "Show member ID at checkout"],
            ].map(([ic, t]) => (
              <div key={t} className="flex gap-3 md:gap-4 items-center text-xs md:text-[13px] font-normal text-slate-700">
                <span className="text-lg md:text-xl">{ic}</span><span>{t}</span>
              </div>
            ))}
          </div>
          <button onClick={join} disabled={joining}
            className="w-full py-3.5 md:py-4 rounded-xl md:rounded-full font-normal text-[11px] md:text-[13px] uppercase tracking-widest text-white transition-all duration-300 bg-[#FC687D] hover:bg-rose-500 shadow-[0_8px_20px_rgba(252,104,125,0.25)] hover:shadow-[0_12px_25px_rgba(252,104,125,0.35)] active:scale-95 disabled:opacity-50 relative z-10">
            {joining ? "Creating account…" : "Join For Free →"}
          </button>
        </div>
      </div>
    );
  }

  // ── Loyalty Card ──
  const pts = parseFloat(member["Points balance"] || 0);
  const progress = (pts % 100) / 100 * 100;
  const nextReward = Math.ceil((pts + 0.01) / 100) * 100;

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl md:text-[28px] font-normal text-slate-800 tracking-tight">Juja Card</h2>
        <p className="text-slate-500 text-xs md:text-sm mt-0.5 font-normal">Digital Rewards Member</p>
      </div>

        {/* ── DIGITAL LOYALTY CARD ── */}
        <div className="relative w-full overflow-hidden rounded-2xl shadow-2xl">

          {/* CARD TEMPLATE */}
            <Image
              src="/images/loyalty-card-bg.png"
              alt="Loyalty Card"
              width={800}
              height={500}
              className="w-full h-auto object-cover"
            />

          {/* MEMBER NAME */}
          <div className="absolute top-[30%] left-0 w-full text-center px-4">
            <h2 className="text-black font-black tracking-wide text-[24px] md:text-[32px] uppercase">
              {member["customer_name"] || "JUJA MEMBER"}
            </h2>
          </div>

          {/* BARCODE AREA */}
          <div className="absolute bottom-[6%] left-[3%] bg-white px-2 py-2 rounded-lg shadow-lg">

            <Barcode
              value={member["customer_code"] || "JUJA000"}
              width={1.4}
              height={38}
              fontSize={14}
              margin={0}
              background="white"
              lineColor="#C026D3"
              displayValue={true}
            />

          </div>

        </div>

      {/* Points progress */}
      <div className="bg-white rounded-xl md:rounded-[24px] p-5 md:p-6 border border-rose-50 shadow-sm">
        <div className="flex justify-between items-end mb-3 md:mb-4">
          <p className="font-normal text-slate-800 text-[13px] md:text-[15px]">Points Progress</p>
          <p className="text-[10px] md:text-xs font-normal text-slate-400">{pts.toFixed(0)} / {nextReward} pts</p>
        </div>
        <div className="w-full h-2.5 md:h-3 bg-slate-100 rounded-full overflow-hidden mb-2.5 md:mb-3 border border-slate-200">
          <div className="h-full rounded-full transition-all duration-1000 bg-[#FC687D]" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-[10px] md:text-[11px] font-normal text-slate-500">{(nextReward - pts).toFixed(0)} more points until your next free reward 🎁</p>
      </div>

      {/* Edit modal (Luxury Slide-in) */}
      {editing && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300" onClick={() => setEditing(false)}>
          <div className="w-full max-w-md mx-auto bg-white rounded-t-[24px] md:rounded-[32px] p-5 md:p-8 pb-8 md:pb-12 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-full md:slide-in-from-bottom-10 md:zoom-in-95 duration-300 shadow-2xl hide-scrollbar"
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5 md:hidden" />
            
            <div className="flex justify-between items-center mb-5 md:mb-6">
              <h3 className="text-xl md:text-2xl font-normal text-slate-800 tracking-tight">Edit Profile</h3>
              <button onClick={() => setEditing(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-all active:scale-90 md:hidden">
                ✕
              </button>
            </div>

            <form onSubmit={saveEdit} className="space-y-4 md:space-y-5">
              {[
                ["customer_name", "Full Name", "text", "Your full name"],
                ["phone", "Phone Number", "tel", "09XX XXX XXXX"],
                ["address", "Location / City", "text", "e.g. QC, Metro Manila"],
                ["note", "Birthday (YYYY-MM-DD)", "text", "1995-12-25"],
              ].map(([key, lbl, type, ph]) => (
                <div key={key}>
                  <label className="block text-[10px] font-normal uppercase tracking-widest text-slate-400 mb-1.5 ml-1">{lbl}</label>
                  <input type={type} value={form[key]} placeholder={ph}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs md:text-sm font-semibold text-slate-800 focus:outline-none focus:border-[#FC687D] focus:bg-white focus:ring-1 focus:ring-rose-100 transition-all" />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3 pt-4 md:pt-6 mt-4 md:mt-6 border-t border-slate-100">
                <button type="button" onClick={() => setEditing(false)}
                  className="w-full py-3.5 md:py-4 rounded-xl bg-white border border-slate-200 text-slate-500 font-normal uppercase tracking-widest text-[10px] md:text-xs hover:bg-slate-50 hover:text-slate-800 transition-all active:scale-95">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="w-full py-3.5 md:py-4 rounded-xl bg-[#FC687D] text-white font-normal uppercase tracking-widest text-[10px] md:text-xs hover:bg-rose-500 transition-all shadow-[0_4px_15px_rgba(252,104,125,0.25)] disabled:opacity-70 active:scale-95 hover:-translate-y-0.5">
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

// ─── PROFILE TAB ─────────────────────────────────────────────────────────────
function ProfileTab({ user, onLogout }) {
  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
      <div className="bg-white rounded-2xl md:rounded-[32px] border border-rose-50 shadow-sm p-5 md:p-6">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-rose-50 flex items-center justify-center text-2xl md:text-3xl">👤</div>
          <div>
            <p className="font-normal text-slate-800 text-base md:text-lg">{user?.email}</p>
            <p className="text-slate-400 text-[9px] md:text-[10px] font-normal uppercase tracking-widest">Juja Member</p>
          </div>
        </div>
        <button onClick={onLogout} className="w-full py-3.5 rounded-xl bg-slate-50 text-slate-500 font-normal text-[10px] md:text-[11px] uppercase tracking-widest hover:bg-rose-50 hover:text-[#FC687D] active:scale-95 transition-all">
          Sign Out
        </button>
      </div>
    </div>
  );
}

// ─── MAIN CUSTOMER APP ───────────────────────────────────────────────────────
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
      } catch (e) { console.warn("No member profile"); }
      setLoading(false);
    }
    loadData();
  }, [router]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7]">
      <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full"></div>
    </div>
  );

  return (
    <div className="min-h-screen pb-24 pt-16 md:pt-20 bg-[#FFF5F7]">
      <TopHeader user={user} onLogout={async () => { await supabase.auth.signOut(); router.push("/login"); }} />
      
      <main className="max-w-md mx-auto px-4 md:px-5 py-4">
        {tab === "home"    && <HomeTab member={member} user={user} setTab={setTab} />}
        {tab === "order"   && <OrderTab user={user} />}
        {tab === "loyalty" && <LoyaltyTab member={member} setMember={setMember} user={user} />}
        {tab === "booking" && <BookingTab user={user} member={member} />} 
        {tab === "profile" && <ProfileTab user={user} onLogout={async () => { await supabase.auth.signOut(); router.push("/login"); }} />}
      </main>

      <TabBar tab={tab} setTab={setTab} />
    </div>
  );
}