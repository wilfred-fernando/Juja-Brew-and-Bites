"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || session.user.user_metadata?.role !== "admin") {
        router.push("/login");
        return;
      }
      setUser(session.user);
      setLoading(false);
    }
    checkSession();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7]">
        <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full"></div>
      </div>
    );
  }

  // Links for the left sidebar
  const sidebarLinks = [
    { name: "Home", icon: "🏠", path: "/admin", active: true },
    { name: "Live Orders", icon: "📋", path: "/admin/orders" },
    { name: "Menu Builder", icon: "🧩", path: "/admin/menu" },
    { name: "Loyalty", icon: "⭐", path: "/admin/loyalty" }, 
    { name: "Promo Code", icon: "🎁", path: "/admin/promos" },
    { name: "Settings", icon: "⚙️", path: "/admin/settings" },
    { name: "Accounts", icon: "👥", path: "/admin/accounts" },
  ];

  // Cards for the main dashboard grid
  const dashboardCards = [
    { title: "Live Orders", icon: "📋", desc: "View and manage incoming orders in real time.", path: "/admin/orders" },
    { title: "Menu Builder", icon: "🧩", desc: "Add, edit, and organize your menu items and categories.", path: "/admin/menu" },
    { title: "Loyalty Program", icon: "⭐", desc: "Manage customer points, visits, and edit member details.", path: "/admin/loyalty" },
    { title: "Promo Codes", icon: "🎁", desc: "Create and manage discount codes for customers.", path: "/admin/promos" },
    { title: "Settings", icon: "⚙️", desc: "Update store info, hours, delivery fees, and more.", path: "/admin/settings" },
    { title: "Accounts", icon: "👥", desc: "Manage staff access and account settings.", path: "/admin/accounts" },
  ];

  return (
    <div className="min-h-screen bg-[#FFF5F7] flex font-sans text-slate-800">
      
      {/* ── RESTORED ORIGINAL SIDEBAR ── */}
      <aside className="w-72 bg-white border-r border-rose-50 flex flex-col hidden md:flex sticky top-0 h-screen shadow-[4px_0_24px_rgba(252,104,125,0.02)]">
        {/* Logo */}
        <div className="p-8 pb-6">
          <img src={LOGO} alt="Juja" className="h-10 w-auto object-contain mx-auto" />
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 px-6 py-4 space-y-2 overflow-y-auto">
          {sidebarLinks.map((link) => (
            <Link key={link.name} href={link.path}
              className={`flex items-center gap-4 px-6 py-3.5 rounded-full text-[13px] font-bold transition-all ${
                link.active 
                  ? "bg-[#FC687D] text-white shadow-md shadow-rose-200" 
                  : "text-slate-600 hover:bg-rose-50 hover:text-[#FC687D]"
              }`}>
              <span className="text-xl">{link.icon}</span>
              {link.name}
            </Link>
          ))}
        </nav>

        {/* User Profile & Sign Out Bottom Section */}
        <div className="p-6 bg-white">
          {/* User Pill */}
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-full p-1.5 pr-4 mb-4">
            <div className="w-8 h-8 rounded-full bg-rose-100 text-[#FC687D] flex items-center justify-center font-black text-sm shrink-0">
              {user?.email?.charAt(0).toUpperCase() || 'J'}
            </div>
            <span className="text-[10px] font-bold text-slate-500 truncate uppercase tracking-widest">
              {user?.email || "ADMIN@JUJA.COM"}
            </span>
          </div>
          
          {/* Sign Out Button */}
          <button onClick={handleLogout} 
            className="w-full py-3.5 rounded-full border border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-widest hover:border-[#FC687D] hover:text-[#FC687D] hover:bg-rose-50 transition-all shadow-sm">
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 p-8 md:p-12 overflow-y-auto">
        <header className="mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-800 mb-2">
            Welcome Back 👋
          </h1>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Admin Panel • {user?.email}
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Loop through standard cards */}
          {dashboardCards.map((card) => (
            <Link key={card.title} href={card.path} 
              className="bg-white rounded-[32px] p-8 border border-rose-50 shadow-[0_8px_30px_rgba(252,104,125,0.04)] hover:shadow-[0_12px_40px_rgba(252,104,125,0.1)] hover:-translate-y-1 transition-all duration-300 flex flex-col">
              <div className="text-4xl mb-4">{card.icon}</div>
              <h3 className="font-extrabold text-slate-800 text-xl mb-2">{card.title}</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed flex-1">{card.desc}</p>
            </Link>
          ))}

          {/* Special Public Site Card */}
          <div className="bg-[#FFF9FA] rounded-[32px] p-8 border border-rose-100 shadow-sm flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-full blur-3xl pointer-events-none" />
            <div className="text-4xl mb-4 text-[#FC687D] relative z-10">🌐</div>
            <h3 className="font-extrabold text-[#FC687D] text-xl mb-2 relative z-10">Public Site</h3>
            <p className="text-slate-500 text-sm font-medium leading-relaxed mb-6 flex-1 relative z-10">
              Preview your public-facing menu and ordering pages.
            </p>
            <div className="flex gap-3 relative z-10">
              <Link href="/" className="px-5 py-2.5 bg-white border border-rose-100 rounded-full text-[11px] font-bold uppercase tracking-widest text-[#FC687D] hover:bg-[#FC687D] hover:text-white transition-all shadow-sm">
                Home
              </Link>
              <Link href="/customer" className="px-5 py-2.5 bg-white border border-rose-100 rounded-full text-[11px] font-bold uppercase tracking-widest text-[#FC687D] hover:bg-[#FC687D] hover:text-white transition-all shadow-sm">
                Menu
              </Link>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}