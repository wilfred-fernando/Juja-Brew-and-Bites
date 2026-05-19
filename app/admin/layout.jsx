"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AdminSidebar from "@/components/AdminSidebar";

// If you already use these hooks, keep them.
// If not, you can remove them safely.
import { usePortalAuth } from "@/components/usePortalAuth";
import { useIdleLogout } from "@/components/useIdleLogout";

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  const [mobileOpen, setMobileOpen] = useState(false);

  // ✅ Auth gate (admin only)
  const { loading, authorized, userEmail } = usePortalAuth({
    portal: "admin",
    loginPath: "/admin/login",
    allowedRoles: ["admin", "super_admin"],
  });

  // ✅ Close drawer when route changes (mobile UX)
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // ✅ Idle logout (optional)
  useIdleLogout({
    timeoutMs: 60 * 60 * 1000,
    onTimeout: async () => {
      await supabase.auth.signOut();
      router.replace("/admin/login");
    },
    storageKey: "juja:admin:lastActivity",
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/admin/login");
  };

  // ✅ Login page should render cleanly without layout chrome
  if (pathname?.includes("/admin/login")) return <>{children}</>;

  // ✅ Loading while auth resolves
  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#FFF5F7]">
        <div className="w-10 h-10 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
      </div>
    );
  }

  // ✅ Not authorized? Let children render (e.g. login or an access page)
  if (!authorized) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[#FFF5F7] flex">
      {/* Sidebar */}
      <AdminSidebar
        pathname={pathname}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        userEmail={userEmail}
        onLogout={handleLogout}
      />

      {/* Main */}
      <div className="flex-1 md:ml-[260px] min-h-screen">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-40 bg-white border-b border-rose-100 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setMobileOpen(true)}
            className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-2xl"
            aria-label="Open admin menu"
          >
            ☰
          </button>

          <div className="text-sm font-extrabold text-slate-800 tracking-tight">
            Admin Panel
          </div>

          <div className="w-10 h-10" />
        </div>

        <main className="p-6 md:p-10 max-w-7xl mx-auto">{children}</main>
      </div>
    </div>
  );
}