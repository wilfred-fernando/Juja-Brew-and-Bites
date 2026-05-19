"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { usePortalAuth } from "@/components/usePortalAuth";
import AdminSidebar from "@/components/AdminSidebar";

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  const [mobileOpen, setMobileOpen] = useState(false);

  const { loading, authorized, userEmail } = usePortalAuth({
    portal: "admin",
    loginPath: "/admin/login",
    allowedRoles: ["admin", "super_admin"],
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/admin/login");
  };

  // ✅ show login page clean
  if (pathname.includes("/login")) return <>{children}</>;

  // ✅ loading state
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
      </div>
    );
  }

  // ✅ not authorized
  if (!authorized) return <>{children}</>;

  return (
    <div className="flex min-h-screen">

      <AdminSidebar
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        pathname={pathname}
        userEmail={userEmail}
        handleLogout={handleLogout}
      />

      <main className="flex-1 md:ml-[260px] p-6">
        {children}
      </main>

    </div>
  );
}