"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Banknote, LogOut, ReceiptText, Users } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { usePortalAuth } from "@/components/usePortalAuth";
import { useIdleLogout } from "@/components/useIdleLogout";

function financePath(path) {
  if (typeof window === "undefined") return `/finance${path}`;
  return window.location.hostname.startsWith("finance.") ? path : `/finance${path}`;
}

export default function FinanceLayout({ children }) {
  const supabase = getSupabaseClient();
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/finance/login" || pathname === "/login";
  const activeSection = pathname.includes("/payroll") ? "payroll" : "expenses";

  const { loading, authorized, userEmail, userRole, userStoreId } = usePortalAuth({
    portal: "finance",
    loginPath: "/finance/login",
    allowedRoles: ["admin", "super_admin", "cashier"],
    requireStore: false,
  });

  useEffect(() => {
    if (!loading && authorized && userRole === "cashier" && !userStoreId && !isLogin) {
      router.replace(financePath("/login"));
      return;
    }
    if (!loading && authorized && userRole === "cashier" && pathname.includes("/payroll")) {
      router.replace(financePath("/expenses"));
      return;
    }
    if (!loading && !authorized && !isLogin) {
      router.replace(financePath("/login"));
    }
  }, [authorized, isLogin, loading, pathname, router, userRole, userStoreId]);

  useIdleLogout({
    timeoutMs: 60 * 60 * 1000,
    onTimeout: async () => {
      await supabase.auth.signOut();
      router.replace(financePath("/login"));
    },
    storageKey: "juja:finance:lastActivity",
  });

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace(financePath("/login"));
  }

  if (isLogin) return <>{children}</>;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FFF5F7]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-rose-200 border-t-[#FC687D]" />
      </div>
    );
  }

  if (!authorized || (userRole === "cashier" && !userStoreId)) return null;

  const navItems = userRole === "cashier"
    ? [["expenses", "/expenses", "Expenses", ReceiptText]]
    : [
      ["expenses", "/expenses", "Expenses", ReceiptText],
      ["payroll", "/payroll", "Payroll", Users],
    ];

  return (
    <div className="min-h-screen bg-[#FFF5F7]">
      <header className="sticky top-0 z-30 border-b border-rose-100 bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:px-6">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-[#FC687D]">
              <Banknote size={20} />
            </span>
            <div>
              <h1 className="text-sm font-black uppercase tracking-wide text-slate-900">Finance Admin</h1>
              <p className="text-xs font-semibold text-slate-500">{userEmail}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <nav className="hidden items-center gap-1 rounded-xl border border-rose-100 bg-rose-50 p-1 sm:flex">
              {navItems.map(([key, path, label, Icon]) => (
                <Link
                  key={key}
                  href={financePath(path)}
                  className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[10px] font-black uppercase tracking-wide ${
                    activeSection === key ? "bg-white text-[#FC687D] shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </Link>
              ))}
            </nav>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-100 bg-white px-3 text-xs font-black uppercase tracking-wide text-slate-700 hover:bg-rose-50 hover:text-[#FC687D]"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </div>

        <nav className="mt-3 grid w-full grid-cols-2 gap-2 sm:hidden">
          {navItems.map(([key, path, label, Icon]) => (
            <Link
              key={key}
              href={financePath(path)}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border text-[10px] font-black uppercase tracking-wide ${
                activeSection === key ? "border-rose-200 bg-white text-[#FC687D]" : "border-rose-100 bg-rose-50 text-slate-500"
              }`}
            >
              <Icon size={14} />
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="w-full p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
