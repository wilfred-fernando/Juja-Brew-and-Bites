"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

function genMemberId() {
  const n = String(Math.floor(Math.random() * 999999) + 1).padStart(6, "0");
  return `JUJA${new Date().getFullYear()}${n}`;
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

      {!member && (
        <button onClick={() => setTab("loyalty")}
          className="w-full rounded-[24px] p-6 text-center border-2 border-dashed border-rose-200 bg-[#FFF9FA] hover:bg-rose-50 transition-all duration-300 group">
          <p className="text-3xl mb-2 group-hover:scale-110 transition-transform">⭐</p>
          <p className="font-extrabold text-[#FC687D] text-[15px]">Join the Loyalty Program</p>
          <p className="text-slate-500 text-xs mt-1 font-medium">Earn points on every visit to unlock free food!</p>
        </button>
      )}

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
        phone: "", address: "", note: "",
        customer_code: genMemberId(),
        points_balance: 0, total_visits: 0,
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
          <button onClick={join} disabled={joining}
            className="w-full py-4 rounded-full font-bold text-[13px] uppercase tracking-widest text-white transition-all bg-[#FC687D] hover:bg-rose-500 shadow-[0_8px_20px_rgba(252,104,125,0.3)] disabled:opacity-50 relative z-10">
            {joining ? "Creating account…" : "Join For Free →"}
          </button>
        </div>
      </div>
    );
  }

  const pts = parseFloat(member.points_balance) || 0;
  const progress = (pts % 100) / 100 * 100;
  const nextReward = Math.ceil((pts + 0.01) / 100) * 100;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-[28px] font-extrabold text-slate-800 tracking-tight">Juja Card</h2>
        <p className="text-slate-500 text-sm mt-1 font-medium">Digital Rewards Member</p>
      </div>

      <div className="rounded-[32px] overflow-hidden shadow-[0_20px_40px_rgba(252,104,125,0.2)]"
        style={{ background: "linear-gradient(135deg, #FC687D 0%, #f43f5e 100%)" }}>
        <div className="px-6 pt-8 pb-6 text-center border-b border-white/20 relative">
          <div className="w-20 h-20 rounded-[24px] mx-auto mb-4 flex items-center justify-center text-4xl bg-white/20 border border-white/30 backdrop-blur-md shadow-inner">👤</div>
          <h3 className="text-2xl font-extrabold text-white tracking-tight">{member.customer_name || "Juja Member"}</h3>
        </div>
        <div className="px-6 py-6 space-y-5 border-b border-white/20 bg-black/5">
          <div className="flex items-center gap-4"><span className="text-xl text-white/60 w-7 text-center">📞</span><span className="text-white text-[15px] font-semibold">{member.phone || "—"}</span></div>
          <div className="flex items-center gap-4"><span className="text-xl text-white/60 w-7 text-center">📍</span><span className="text-white text-[15px] font-semibold">{member.address || "—"}</span></div>
          <div className="flex items-center gap-4"><span className="text-xl text-white/60 w-7 text-center">▦</span><span className="text-white text-[15px] font-mono tracking-widest font-bold">{member.customer_code}</span></div>
        </div>
        <div className="px-6 pt-6 pb-8 flex justify-between items-center bg-black/10">
          <button onClick={startEdit} className="text-[11px] font-black uppercase tracking-[0.25em] text-white/80 hover:text-white transition bg-white/10 px-5 py-2.5 rounded-full border border-white/20">Edit Profile</button>
          <div className="text-right">
            <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest mb-1">Total Points</p>
            <p className="text-3xl font-black text-white">{pts.toFixed(0)}</p>
          </div>
        </div>
      </div>

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

      {editing && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-end" onClick={() => setEditing(false)}>
          <div className="w-full max-w-md mx-auto bg-white rounded-t-[32px] p-8 pb-12 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-extrabold text-slate-800 mb-6">Edit Profile</h3>
            <form onSubmit={saveEdit} className="space-y-5">
              <input type="text" value={form.customer_name} placeholder="Full Name" onChange={e => setForm({...form, customer_name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm" />
              <input type="tel" value={form.phone} placeholder="Phone Number" onChange={e => setForm({...form, phone: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm" />
              <button type="submit" disabled={saving} className="w-full py-4 rounded-full font-bold text-white bg-[#FC687D]">{saving ? "Saving…" : "Save Changes"}</button>
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
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between sticky top-16 z-30 bg-[#FFF5F7] pt-2 pb-4">
        <div>
          <h2 className="text-[28px] font-extrabold text-slate-800 tracking-tight">Menu</h2>
          <p className="text-slate-500 text-sm mt-0.5 font-medium">Pick your favorites</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 pt-1 -mx-4 px-4 sticky top-[110px] z-20 bg-[#FFF5F7]">
        {cats.map(cat => (
          <button key={cat.id} onClick={() => setActiveTab(cat.name)}
            className={`flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all shadow-sm border ${
              activeTab === cat.name ? "bg-[#FC687D] text-white border-[#FC687D]" : "bg-white text-slate-500 border-rose-100"
            }`}>
            {cat.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {filtered.map(item => (
          <div key={item.id} className="bg-white rounded-[24px] border border-rose-50 shadow-sm overflow-hidden flex flex-col p-3">
            <p className="font-extrabold text-slate-800 text-[13px] leading-tight mb-1">{item.name}</p>
            <p className="font-black text-[#FC687D] text-[15px] mb-3">₱{item.price}</p>
            <div className="mt-auto">
              <button onClick={() => add(item)} className="w-full py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest text-[#FC687D] bg-[#FFF9FA] border border-rose-100">
                Add to Cart
              </button>
            </div>
          </div>
        ))}
      </div>
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
    customer_phone: member?.phone || "",
    event_type: "", event_date: "", start_time: "", end_time: "", guest_count: ""
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
      const payload = { ...form, guest_count: parseInt(form.guest_count) || 0, status: "Pending", user_id: user?.id };
      const { data, error } = await supabase.from("room_bookings").insert([payload]).select();
      if (!error && data) {
        setBookings(prev => [data[0], ...prev]);
        setShowForm(false);
        setSuccess(true);
        setForm(f => ({ ...f, event_type: "", event_date: "", start_time: "", end_time: "", guest_count: "" }));
        setTimeout(() => setSuccess(false), 5000);
      }
    } catch (e) { console.error(e); }
    setSubmitting(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[28px] font-extrabold text-slate-800 tracking-tight">Book Room</h2>
          <p className="text-slate-500 text-sm mt-0.5 font-medium">Function room reservations</p>
        </div>
        <button onClick={() => setShowForm(true)} className="text-[11px] font-bold uppercase tracking-widest px-5 py-3 rounded-full text-white bg-[#FC687D]">
          + Book Now
        </button>
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-[24px] p-5 flex items-center gap-4 shadow-sm">
          <span className="text-3xl bg-white w-12 h-12 rounded-full flex items-center justify-center shadow-sm">✅</span>
          <div>
            <p className="font-extrabold text-emerald-800 text-[15px]">Booking Submitted!</p>
            <p className="text-emerald-600 text-[13px] font-medium mt-0.5">We'll confirm your reservation within 24 hours.</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {loading ? <div className="h-24 bg-white rounded-[24px] animate-pulse" /> : 
          bookings.length === 0 ? <div className="text-center text-slate-400 font-bold uppercase text-xs tracking-widest py-10">No bookings yet.</div> : 
          bookings.map(b => (
            <div key={b.id} className="bg-white rounded-[24px] p-5 border border-rose-50 shadow-sm">
              <p className="font-extrabold text-slate-800">{b.event_type}</p>
              <p className="text-slate-500 text-xs font-medium">{b.event_date} · {b.start_time}</p>
            </div>
          ))
        }
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-end" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md mx-auto bg-white rounded-t-[32px] p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <form onSubmit={submit} className="space-y-4">
              <h3 className="text-xl font-extrabold text-slate-800 mb-2">Reserve Room</h3>
              <input type="text" placeholder="Event Type" required value={form.event_type} onChange={e => setForm({...form, event_type: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl text-sm" />
              <input type="date" required value={form.event_date} onChange={e => setForm({...form, event_date: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl text-sm" />
              <div className="grid grid-cols-2 gap-4">
                <input type="time" required value={form.start_time} onChange={e => setForm({...form, start_time: e.target.value})} className="p-4 bg-slate-50 rounded-2xl text-sm" />
                <input type="time" required value={form.end_time} onChange={e => setForm({...form, end_time: e.target.value})} className="p-4 bg-slate-50 rounded-2xl text-sm" />
              </div>
              <input type="number" placeholder="Guests" required value={form.guest_count} onChange={e => setForm({...form, guest_count: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl text-sm" />
              <button type="submit" disabled={submitting} className="w-full py-4 bg-[#FC687D] text-white rounded-full font-bold uppercase tracking-widest text-xs">Submit Booking →</button>
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
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white rounded-[32px] border border-rose-50 shadow-sm p-6">
        <div className="flex items-center gap-5 mb-6">
          <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center text-3xl">👤</div>
          <div>
            <p className="font-extrabold text-slate-800 text-lg">{user?.email}</p>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-widest">Juja Member</p>
          </div>
        </div>
        <button onClick={onLogout} className="w-full py-4 rounded-full bg-slate-50 text-slate-500 font-bold text-[13px] uppercase tracking-widest hover:bg-rose-50 hover:text-[#FC687D] transition-all">
          Sign Out
        </button>
      </div>
    </div>
  );
}

// ─── MAIN CUSTOMER PAGE ───────────────────────────────────────────────────────
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

  if (loading) return <div className="min-h-screen bg-[#FFF5F7]" />;

  return (
    <div className="min-h-screen pb-28 pt-20 bg-[#FFF5F7]">
      <TopHeader user={user} onLogout={() => { supabase.auth.signOut(); router.push("/login"); }} />
      <div className="max-w-md mx-auto px-5 py-4">
        {tab === "home"    && <HomeTab member={member} user={user} setTab={setTab} />}
        {tab === "order"   && <OrderTab user={user} />}
        {tab === "loyalty" && <LoyaltyTab member={member} setMember={setMember} user={user} />}
        {tab === "booking" && <BookingTab user={user} member={member} />}
        {tab === "profile" && <ProfileTab user={user} onLogout={() => { supabase.auth.signOut(); router.push("/login"); }} />}
      </div>
      <TabBar tab={tab} setTab={setTab} />
    </div>
  );
}