"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from '@/lib/supabase'; 

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  
  // UI States
  const [mobileOpen, setMobileOpen] = useState(false);
  
  // Security & Auth States
  const [userEmail, setUserEmail] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false); 

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login"); 
      } else {
        setUserEmail(session.user.email);
        setIsAuthorized(true);
      }
    };
    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) router.push("/login");
    });

    return () => authListener.subscription.unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const navItems = [
    { name: "Home", path: "/admin", icon: "🏠" },
    { name: "Live Orders", path: "/admin/orders", icon: "📋" },
    { name: "Menu Builder", path: "/admin/menu", icon: "🧩" },
    { name: "POS System", path: "/admin/pos", icon: "🛒" },
    { name: "Loyalty Program", icon: "⭐", path: "/admin/loyalty" },
    { name: "Promo Code", path: "/admin/promos", icon: "🎁" },
    { name: "Settings", path: "/admin/settings", icon: "⚙️" },
    { name: "Accounts", path: "/admin/accounts", icon: "👥" },
  ];

  // ─── SECURITY GATE ───
  if (!isAuthorized) {
    return (
      <div className="h-[100dvh] w-full flex items-center justify-center bg-[#FFF5F7]">
        <div className="w-10 h-10 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full"></div>
      </div>
    );
  }

  // ─── VERIFIED ADMIN DASHBOARD ───
  return (
    <div className="min-h-[100dvh] bg-[#FFF5F7] font-sans flex overflow-hidden">
      
      {/* ─── MOBILE TOP BAR ─── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-b border-rose-50 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4">
          <img src={LOGO} alt="Juja" className="h-8 object-contain transition-transform hover:scale-105" />
          <button onClick={() => setMobileOpen(true)} className="p-2 -mr-2 active:scale-95 transition-all">
            <svg width="28" height="28" fill="none" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
              <path d="M4 6h16M4 12h16M4 18h16"></path>
            </svg>
          </button>
        </div>
      </div>

      {/* ─── MOBILE BACKDROP OVERLAY ─── */}
      {mobileOpen && (
        <div 
          className="md:hidden fixed inset-0 z-[50] bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ─── UNIFIED SIDEBAR (SLIDE-IN ON MOBILE, FIXED ON DESKTOP) ─── */}
      <aside className={`fixed inset-y-0 left-0 z-[60] w-[280px] md:w-[260px] bg-[#FFF9FA] border-r border-rose-100 flex flex-col shadow-2xl md:shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:rounded-r-3xl`}>
        
        {/* Sidebar Header */}
        <div className="p-6 md:p-8 pb-4 md:pb-6 flex justify-between items-center border-b border-rose-50/50">
          <img src={LOGO} alt="Juja" className="h-10 md:h-14 object-contain transition-transform hover:scale-105" />
          <button onClick={() => setMobileOpen(false)} className="md:hidden w-8 h-8 flex items-center justify-center bg-rose-50 text-rose-500 rounded-full active:scale-90 transition-all">
            ✕
          </button>
        </div>
        
        {/* Navigation Links */}
        <nav className="flex-1 py-6 px-4 md:px-5 space-y-2 overflow-y-auto hide-scrollbar">
          {navItems.map((item) => {
            // Precise active state matching
            const isActive = item.path === "/admin" ? pathname === "/admin" : pathname?.startsWith(item.path);
            
            return (
              <Link key={item.name} href={item.path} onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-200 active:scale-95 ${
                  isActive 
                    ? "bg-[#FC687D] text-white shadow-lg shadow-rose-200/50 translate-x-1 md:-translate-y-0.5" 
                    : "text-slate-600 hover:bg-rose-50 hover:text-[#FC687D]"
                }`}>
                <span className="text-xl md:text-2xl">{item.icon}</span>
                <span className="text-sm font-bold tracking-tight mt-0.5">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Info & Sign Out Footer */}
        <div className="p-6 md:p-8 border-t border-rose-50 bg-white/50 backdrop-blur-md md:rounded-b-3xl pb-safe">
          <div className="flex items-center gap-3 px-2 mb-4 bg-white p-3 rounded-xl shadow-sm border border-slate-50">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-[#FC687D] flex items-center justify-center font-bold text-sm shadow-inner shrink-0">
              {userEmail ? userEmail.charAt(0).toUpperCase() : "A"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{userEmail || "Admin"}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full text-center px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 border-2 border-slate-100 hover:border-rose-200 hover:text-rose-500 hover:bg-white active:scale-95 transition-all shadow-sm">
            Sign Out
          </button>
        </div>
      </aside>

      {/* ─── MAIN CONTENT AREA ─── */}
      <main className="flex-1 flex flex-col w-full h-[100dvh] md:ml-[260px] pt-[72px] md:pt-0 overflow-y-auto bg-[#FFF5F7] hide-scrollbar">
        {/* We use a wrapper div here to ensure padding applies correctly without breaking sticky elements inside pages */}
        <div className="flex-1 p-0 md:p-6 w-full">
          {children}
        </div>
      </main>
      
    </div>
  );
}