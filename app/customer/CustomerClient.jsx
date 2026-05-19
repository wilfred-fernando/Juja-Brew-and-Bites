"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
import BookingTab from "@/components/BookingForm";


const CustomerClient = dynamic(() => import("./CustomerClient"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7]">
      <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
    </div>
  ),
});

export default function CustomerPage() {
  return <CustomerClient />;
}
``


// Client-only barcode
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

/* ─────────────────────────────────────────
   Bottom Tab Bar
───────────────────────────────────────── */
function TabBar({ tab, setTab }) {
  const tabs = [
    { id: "home", icon: "🏠", label: "Home" },
    { id: "order", icon: "🍽️", label: "Order" },
    { id: "promo", icon: "🎁", label: "Promo" },
    { id: "loyalty", icon: "⭐", label: "Loyalty" },
    { id: "booking", icon: "📅", label: "Book" },
    { id: "profile", icon: "👤", label: "Profile" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 z-50">
      <div className="flex justify-center gap-3 py-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-col items-center px-2 py-1 text-[10px] transition-all ${
              tab === t.id ? "text-[#FC687D]" : "text-slate-400"
            }`}
          >
            <span className="text-base">{t.icon}</span>
            <span className="leading-tight">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Home Tab
───────────────────────────────────────── */
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="active:scale-95 transition">
            <img src={LOGO} alt="Juja" className="h-8 md:h-10 w-auto object-contain" />
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

      <div className="grid grid-cols-2 gap-3 md:gap-4">
        {[
          { icon: "🍽️", label: "Order Food", sub: "Browse menu", tab: "order" },
          { icon: "⭐", label: "Loyalty", sub: "Rewards", tab: "loyalty" },
          { icon: "🗓", label: "Book Room", sub: "Function room", tab: "booking" },
          { icon: "🎁", label: "Promos", sub: "Deals & offers", tab: "promo" },
        ].map((c) => (
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
        ))}
      </div>

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

/* ─────────────────────────────────────────
   Order Tab (your existing logic can stay)
───────────────────────────────────────── */
function OrderTab() {
  return (
    <div className="bg-white border border-rose-50 rounded-2xl p-5 shadow-sm">
      <p className="text-slate-700 font-semibold">Order tab content…</p>
      <p className="text-slate-400 text-xs mt-1">
        (Keep your full OrderTab code here exactly as you already have.)
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────
   Loyalty Tab (your existing logic can stay)
───────────────────────────────────────── */
function LoyaltyTab({ member, setMember, user }) {
  const [joining, setJoining] = useState(false);
  const pts = useMemo(() => parseFloat(member?.["Points balance"] ?? 0) || 0, [member]);

  const join = async () => {
    if (!user?.id) return;
    setJoining(true);

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

    const { data, error } = await supabase.from("loyalty_members").insert([payload]).select().single();
    if (!error) setMember(data);
    setJoining(false);
  };

  if (!member) {
    return (
      <div className="bg-white border border-rose-50 rounded-2xl p-6 shadow-sm text-center">
        <p className="text-slate-800 font-semibold">Join Juja Rewards</p>
        <button
          onClick={join}
          disabled={joining}
          className="mt-3 w-full py-3 rounded-xl bg-[#FC687D] text-white text-[11px] uppercase tracking-widest disabled:opacity-60"
        >
          {joining ? "Creating…" : "Join For Free →"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-rose-50 rounded-2xl p-5 shadow-sm">
        <p className="text-slate-800 font-semibold">Your Card</p>
        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-2xl p-4">
          <Barcode value={member?.customer_code || "JUJA000000"} width={1.4} height={70} />
        </div>
        <p className="mt-3 text-slate-500 text-sm">Points: {pts.toFixed(0)}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Promo Tab
───────────────────────────────────────── */
function PromoTab({ setTab, setAppliedPromo }) {
  const [promos, setPromos] = useState([]);

  useEffect(() => {
    async function fetchPromos() {
      const { data } = await supabase.from("promotions").select("*").eq("is_active", true);
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

/* ─────────────────────────────────────────
   Profile Tab
───────────────────────────────────────── */
function ProfileTab({ user, onLogout }) {
  return (
    <div className="bg-white rounded-2xl border border-rose-50 shadow-sm p-5">
      <p className="text-slate-800 font-semibold">{user?.email}</p>
      <button
        onClick={onLogout}
        className="mt-4 w-full py-3 rounded-xl bg-slate-50 text-slate-600 text-[10px] uppercase tracking-widest"
      >
        Sign Out
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────
   MAIN Client Page
───────────────────────────────────────── */
export default function CustomerClient() {
  const [user, setUser] = useState(null);
  const [member, setMember] = useState(null);
  const [tab, setTab] = useState("home");
  const [loading, setLoading] = useState(true);
  const [appliedPromo, setAppliedPromo] = useState(null);

  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;

      if (!session) {
        router.push("/login");
        return;
      }

      if (!mounted) return;

      setUser(session.user);

      const { data: mData } = await supabase
        .from("loyalty_members")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (mData) setMember(mData);

      setLoading(false);
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("loyalty-live-update")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "loyalty_members" }, (payload) => {
        if (payload?.new?.user_id === user.id) setMember(payload.new);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

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
      <main className="max-w-6xl mx-auto px-4 md:px-5 py-4">
        {tab === "home" && <HomeTab member={member} user={user} setTab={setTab} />}
        {tab === "order" && <OrderTab />}
        {tab === "loyalty" && <LoyaltyTab member={member} setMember={setMember} user={user} />}
        {tab === "booking" && <BookingTab user={user} member={member} />}
        {tab === "promo" && <PromoTab setTab={setTab} setAppliedPromo={setAppliedPromo} />}
        {tab === "profile" && <ProfileTab user={user} onLogout={logout} />}
      </main>

      <TabBar tab={tab} setTab={setTab} />
    </div>
  );
}
``