"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from '@/lib/supabase'; 
import "@/app/style.css";

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  
  // UI States
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false); 
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // If no session, send to login
        if (pathname !== "/login") {
          router.push("/login");
        }
        setLoading(false);
      } else {
        setUserEmail(session.user.email);
        setIsAuthorized(true);
        setLoading(false);
      }
    };

    checkUser();

    // Listen for sign-out events
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        router.push("/login");
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, [router, pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const navItems = [
    { name: "Home", path: "/admin", icon: "🏠" },
    { name: "Live Orders", path: "/admin/orders", icon: "📋" },
    { name: "Menu Builder", path: "/admin/menu", icon: "🧩" },
    { name: "POS System", path: "/admin/pos", icon: "🛒" },
    { name: "Loyalty Program", path: "/admin/loyalty", icon: "⭐" }, 
    { name: "Promo Codes", path: "/admin/promos", icon: "🎁" },    
    { name: "Settings", path: "/admin/settings", icon: "⚙️" },
  ];

  // 1. THE LOGIN FIX: Hide sidebar entirely if on the login page
  if (pathname && pathname.includes('login')) {
    return <>{children}</>;
  }

  // 2. Loading State (The Spinner)
  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#FFF5F7]">
        <div className="w-10 h-10 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full"></div>
      </div>
    );
  }

  // 3. Auth Gate: If logged in, show sidebar + content. If not, just show children
  if (!isAuthorized) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#FFF5F7] flex overflow-hidden" suppressHydrationWarning>
      
      {/* --- SIDEBAR --- */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-white border-r border-rose-100 flex flex-col transition-transform duration-300 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        {/* Logo Area */}
        <div className="p-8 border-b border-rose-50 flex justify-between items-center">
          <img src={LOGO} alt="Juja" className="h-10 object-contain" />
          <button onClick={() => setMobileOpen(false)} className="md:hidden text-rose-400 font-bold">✕</button>
        </div>
        
        {/* Nav Links */}
        <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            // Logic to handle both /admin and / paths on the subdomain
            const isActive = item.path === "/admin" 
              ? (pathname === "/admin" || pathname === "/") 
              : pathname.startsWith(item.path);

            return (
              <Link 
                key={item.name} 
                href={item.path} 
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-4 px-5 py-4 rounded-2xl font-bold transition-all ${
                  isActive 
                    ? "bg-[#FC687D] text-white shadow-lg shadow-rose-200" 
                    : "text-slate-600 hover:bg-rose-50 hover:text-[#FC687D]"
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="text-sm">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer Area */}
        <div className="p-6 border-t border-rose-50 bg-slate-50/50">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-[#FC687D] font-bold text-xs">
              {userEmail ? userEmail.charAt(0).toUpperCase() : "A"}
            </div>
            <p className="text-[10px] font-black text-slate-400 truncate uppercase tracking-widest">
              {userEmail || "Staff"}
            </p>
          </div>
          <button 
            onClick={handleLogout} 
            className="w-full py-3 bg-white border border-slate-200 text-slate-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-50 hover:text-rose-500 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 md:ml-[260px] relative h-screen overflow-y-auto">
        {/* Mobile Header (Only visible on small screens) */}
        <div className="md:hidden flex items-center justify-between p-4 bg-white border-b border-rose-50 sticky top-0 z-40">
          <img src={LOGO} alt="Juja" className="h-6 object-contain" />
          <button onClick={() => setMobileOpen(true)} className="p-2">
            <span className="text-2xl">≡</span>
          </button>
        </div>

        <div className="p-6 md:p-10 max-w-7xl mx-auto">
          {children}
        </div>
      </main>

    </div>
  );
}