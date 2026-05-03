"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserEmail(data.user.email);
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const navItems = [
    { name: "Dashboard", path: "/admin", icon: "🏠" },
    { name: "Live Orders", path: "/admin/orders", icon: "📋" },
    { name: "Menu Builder", path: "/admin/menu", icon: "🧩" },
    { name: "Promo Codes", path: "/admin/promos", icon: "🎁" },
    { name: "Settings", path: "/admin/settings", icon: "⚙️" },
    { name: "Accounts", path: "/admin/accounts", icon: "👥" },
  ];

  return (
    <div className="min-h-screen bg-[#FFF5F7] font-sans flex flex-col md:flex-row">
      
      {/* ─── MOBILE TOP BAR ─── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-rose-50 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4">
          {/* Blacked out logo for light background */}
          <img src={LOGO} alt="Juja" className="h-8 object-contain" style={{ filter: "brightness(0)" }} />
          <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 -mr-2">
            <div className="w-5 space-y-[5px]">
              <span className={`block h-[2px] bg-slate-800 rounded transition-all duration-300 ${mobileOpen ? "rotate-45 translate-y-[7px]" : ""}`} />
              <span className={`block h-[2px] bg-slate-800 rounded transition-all duration-300 ${mobileOpen ? "opacity-0" : ""}`} />
              <span className={`block h-[2px] bg-slate-800 rounded transition-all duration-300 ${mobileOpen ? "-rotate-45 -translate-y-[7px]" : ""}`} />
            </div>
          </button>
        </div>
        
        {/* Mobile Dropdown Menu */}
        {mobileOpen && (
          <div className="bg-white border-t border-rose-50 px-6 py-6 shadow-2xl space-y-2">
            {navItems.map((item) => {
              const isActive = item.path === "/admin" ? pathname === "/admin" : pathname?.startsWith(item.path);
              return (
                <Link key={item.name} href={item.path} onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-4 px-6 py-3.5 rounded-full transition-all duration-300 ${
                    isActive 
                      ? "bg-[#FC687D] text-white shadow-[0_8px_20px_rgba(252,104,125,0.3)]" 
                      : "text-slate-500 hover:bg-rose-50 hover:text-[#FC687D]"
                  }`}>
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-[11px] font-bold uppercase tracking-widest">{item.name}</span>
                </Link>
              );
            })}
            <div className="pt-4 mt-4 border-t border-rose-50">
              <button onClick={handleLogout} className="w-full text-left px-6 py-3.5 text-[11px] font-bold uppercase tracking-widest text-slate-400 hover:text-rose-500 transition-colors">
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── DESKTOP SIDEBAR ─── */}
      <aside className="hidden md:flex w-[260px] bg-white border-r border-rose-100 flex-col fixed h-full z-50 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="p-8 pb-6 flex justify-center border-b border-rose-50/50">
          <img src={LOGO} alt="Juja" className="h-14 object-contain transition-transform hover:scale-105" style={{ filter: "brightness(0)" }} />
        </div>
        
        <nav className="flex-1 py-8 px-5 space-y-2 overflow-y-auto hide-scrollbar">
          {navItems.map((item) => {
            const isActive = item.path === "/admin" ? pathname === "/admin" : pathname?.startsWith(item.path);
            return (
              <Link key={item.name} href={item.path}
                className={`flex items-center gap-4 px-5 py-4 rounded-full transition-all duration-300 ${
                  isActive 
                    ? "bg-[#FC687D] text-white shadow-[0_8px_20px_rgba(252,104,125,0.25)] -translate-y-0.5" 
                    : "text-slate-500 hover:bg-rose-50 hover:text-[#FC687D]"
                }`}>
                <span className="text-xl">{item.icon}</span>
                <span className="text-[10px] font-extrabold uppercase tracking-widest mt-0.5">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-6 border-t border-rose-50/50 bg-slate-50/30">
          <div className="flex items-center gap-3 px-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-rose-100 text-[#FC687D] flex items-center justify-center font-bold text-xs">
              {userEmail ? userEmail.charAt(0).toUpperCase() : "A"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{userEmail || "Admin"}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full text-center px-4 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest text-slate-500 border border-slate-200 hover:border-rose-200 hover:text-rose-500 hover:bg-white transition-all shadow-sm">
            Sign Out
          </button>
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <main className="flex-1 md:ml-[260px] pt-20 md:pt-0 p-6 md:p-10 transition-all duration-300">
        {children}
      </main>
      
    </div>
  );
}