"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePortalAuth } from "@/components/usePortalAuth";
import { useIdleLogout } from "@/components/useIdleLogout";

import "@/app/style.css";

const LOGO =
  "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  // ✅ Single source of truth for UI state
  const [mobileOpen, setMobileOpen] = useState(false);

  // ✅ Auth gate: only admins allowed (single source of truth)
  const { loading, authorized, userEmail } = usePortalAuth({
    portal: "admin",
    loginPath: "/admin/login",
    allowedRoles: ["admin", "super_admin"],
  });

  // ✅ Auto close sidebar on navigation (mobile UX)
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // ✅ Auto logout if idle for 1 hour
  useIdleLogout({
    timeoutMs: 60 * 60 * 1000,
    onTimeout: async () => {
      await supabase.auth.signOut();
      router.push("/admin/login");
    },
    storageKey: "juja:admin:lastActivity",
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/admin/login");
  };

  // ✅ Hide layout for login page (so it renders login cleanly)
  if (pathname?.includes("/login")) return <>{children}</>;

  // ✅ Loading spinner while auth resolves
  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#FFF5F7]">
        <div className="w-10 h-10 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
      </div>
    );
  }

  // ✅ If not authorized, let child pages (e.g. login or error page) render
  if (!authorized) return <>{children}</>;

  const navItems = [
    { name: "Home", path: "/admin", icon: "🏠" },
    { name: "Bookings", path: "/admin/bookings", icon: "📅" },
    { name: "Live Orders", path: "/admin/orders", icon: "📋" },
    { name: "Menu Builder", path: "/admin/menu", icon: "🧩" },
    { name: "POS System", path: "/admin/pos-admin", icon: "🛒" },
    { name: "Loyalty Program", path: "/admin/loyalty", icon: "⭐" },
    { name: "Promo Codes", path: "/admin/promos", icon: "🎁" },
    { name: "Settings", path: "/admin/settings", icon: "⚙️" },
  ];

  return (
    <div
      className="min-h-screen bg-[#FFF5F7] flex overflow-hidden"
      suppressHydrationWarning
    >
      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-white border-r border-rose-100 flex flex-col transition-transform duration-300 md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-8 border-b border-rose-50 flex justify-between items-center">
          <img src={LOGO} alt="Juja" className="h-10 object-contain" />
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden text-rose-400 font-bold"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              item.path === "/admin"
                ? pathname === "/admin" || pathname === "/"
                : pathname?.startsWith(item.path);

            return (
              <Link
                key={item.name}
                href={item.path}
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

      {/* MAIN */}
      <main className="flex-1 md:ml-[260px] relative h-screen overflow-y-auto">
        <div className="md:hidden flex items-center justify-between p-4 bg-white border-b border-rose-50 sticky top-0 z-40">
          <img src={LOGO} alt="Juja" className="h-6 object-contain" />
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2"
            aria-label="Open menu"
          >
            <span className="text-2xl">≡</span>
          </button>
        </div>

        <div className="p-6 md:p-10 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
``