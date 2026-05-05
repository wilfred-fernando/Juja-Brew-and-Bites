"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BookingTab from "@/components/BookingForm"; // Keeping your externalized booking form

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
            <span className={`text-[8px] md:text-[9px] font-black uppercase tracking-widest ${tab === t.id ? "text-[#FC687D]" : "text-slate-400"}`}>{t.label}</span>
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
          <p className="text-[#FC687D] text-[9px] md:text-[10px] font-black uppercase tracking-[0.25em] mb-1">Welcome back 👋</p>
          <h2 className="text-2xl md:text-3xl font-black text-slate-800 leading-tight mb-1 tracking-tight">
            {member?.customer_name || user?.user_metadata?.full_name || "Coffee Lover"}
          </h2>
          {member?.customer_code && (
            <p className="text-slate-400 text-[10px] md:text-xs font-mono tracking-wider font-bold">{member.customer_code}</p>
          )}

          {member && (
            <div className="flex gap-4 md:gap-6 mt-4 md:mt-6 bg-[#FFF9FA] p-3 md:p-4 rounded-xl md:rounded-2xl border border-rose-50 inline-flex">
              <div>
                <p className="text-[#FC687D] font-black text-xl md:text-2xl leading-none">{parseFloat(member.points_balance || 0).toFixed(0)}</p>
                <p className="text-slate-500 text-[9px] md:text-[10px] uppercase font-bold tracking-widest mt-1">Points</p>
              </div>
              <div className="w-px bg-rose-100" />
              <div>
                <p className="text-slate-800 font-black text-xl md:text-2xl leading-none">{member.total_visits || 0}</p>
                <p className="text-slate-500 text-[9px] md:text-[10px] uppercase font-bold tracking-widest mt-1">Visits</p>
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
                <p className="font-black text-slate-800 text-[13px] md:text-[15px]">{c.label}</p>
                <p className="text-slate-400 text-[9px] md:text-[11px] font-bold uppercase tracking-widest mt-0.5">{c.sub}</p>
              </Link>
            : <button key={c.label} onClick={() => setTab(c.tab)}
                className="bg-white rounded-xl md:rounded-[24px] p-4 md:p-5 border border-rose-50 shadow-sm text-left hover:shadow-md active:scale-95 transition-all duration-300">
                <div className="text-2xl md:text-3xl mb-2 md:mb-3 bg-rose-50 w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-[#FC687D]">{c.icon}</div>
                <p className="font-black text-slate-800 text-[13px] md:text-[15px]">{c.label}</p>
                <p className="text-slate-400 text-[9px] md:text-[11px] font-bold uppercase tracking-widest mt-0.5">{c.sub}</p>
              </button>
        ))}
      </div>

      {/* Store Info */}
      <div className="bg-white rounded-xl md:rounded-[24px] p-5 border border-rose-50 shadow-sm">
        <p className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Visit Us</p>
        <div className="space-y-2.5 text-[11px] md:text-[13px] text-slate-600 font-bold">
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
            className={`flex-shrink-0 px-4 md:px-5 py-2 md:py-2.5 rounded-xl text-[10px] md:text-[11px] font-black uppercase tracking-widest transition-all duration-300 active:scale-95 shadow-sm border ${
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
                <p className="font-black text-slate-800 text-[11px] md:text-[13px] leading-tight mb-1">{item.name}</p>
                <p className="font-black text-[#FC687D] text-[13px] md:text-[15px] mb-3">₱{item.price}</p>
                
                <div className="mt-auto">
                  {inCart > 0 ? (
                    <div className="flex items-center justify-between bg-slate-50 p-1 rounded-lg border border-slate-200">
                      <button onClick={() => remove(item.id)} className="w-7 h-7 md:w-8 md:h-8 rounded-[6px] bg-white flex items-center justify-center text-slate-600 font-black shadow-sm active:scale-90">−</button>
                      <span className="font-black text-[12px] md:text-[13px] text-slate-700">{inCart}</span>
                      <button onClick={() => add(item)} className="w-7 h-7 md:w-8 md:h-8 rounded-[6px] bg-[#FC687D] flex items-center justify-center text-white font-black shadow-sm active:scale-90">+</button>
                    </div>
                  ) : (
                    <button onClick={() => add(item)} className="w-full py-2 md:py-2.5 rounded-lg text-[9px] md:text-[11px] font-black uppercase tracking-widest text-[#FC687D] bg-[#FFF9FA] border border-rose-100 hover:bg-[#FC687D] hover:text-white transition-all active:scale-95">
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

// ─── LOYALTY TAB (Skipping internals for brevity, keeping styling structure) ──
function LoyaltyTab({ member, setMember, user }) {
  // Uses same tight classes: rounded-xl, active:scale-95, tight padding.
  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl md:text-[28px] font-black text-slate-800 tracking-tight">Juja Card</h2>
        <p className="text-slate-500 text-xs md:text-sm mt-0.5 font-medium">Digital Rewards Member</p>
      </div>
      {member ? (
        <div className="rounded-2xl md:rounded-[32px] overflow-hidden shadow-xl" style={{ background: "linear-gradient(135deg, #FC687D 0%, #f43f5e 100%)" }}>
           <div className="px-5 py-6 md:p-8 text-center border-b border-white/20 relative">
             <h3 className="text-xl md:text-2xl font-black text-white">{member.customer_name || "Juja Member"}</h3>
             <p className="text-white/80 font-mono text-sm mt-1">{member.customer_code}</p>
           </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl md:rounded-[32px] p-6 md:p-8 text-center border border-rose-50 shadow-sm">
           <div className="text-5xl mb-4">⭐</div>
           <h3 className="text-xl font-black text-slate-800 mb-2">Join Juja Rewards</h3>
           <button className="w-full py-3.5 rounded-xl bg-[#FC687D] text-white font-black uppercase tracking-widest text-xs active:scale-95 transition-all">Join Free</button>
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
            <p className="font-black text-slate-800 text-base md:text-lg">{user?.email}</p>
            <p className="text-slate-400 text-[9px] md:text-[10px] font-black uppercase tracking-widest">Juja Member</p>
          </div>
        </div>
        <button onClick={onLogout} className="w-full py-3.5 rounded-xl bg-slate-50 text-slate-500 font-black text-[10px] md:text-[11px] uppercase tracking-widest hover:bg-rose-50 hover:text-[#FC687D] active:scale-95 transition-all">
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