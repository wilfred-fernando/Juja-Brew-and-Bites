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
      <div
        className="flex h-screen items-center justify-center bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(248,250,252,0.78), rgba(226,232,240,0.70)), url('https://images.jujabrewandbites.com/page%20background.png')",
        }}
      >
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-100 border-t-cyan-600" />
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
    <div
      className="min-h-screen bg-cover bg-fixed bg-center bg-no-repeat text-slate-950"
      style={{
        backgroundImage:
          "radial-gradient(circle at top left, rgba(34,211,238,0.18), transparent 32%), linear-gradient(135deg, rgba(248,250,252,0.78), rgba(226,232,240,0.68)), url('https://images.jujabrewandbites.com/page%20background.png')",
      }}
    >
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/82 px-4 py-3 shadow-[0_18px_45px_rgba(2,6,23,0.28)] backdrop-blur-xl sm:px-6">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-400/15 text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.22)]">
              <Banknote size={20} />
            </span>
            <div>
              <h1 className="text-sm font-semibold uppercase tracking-[0.18em] text-white">JUJA Finance</h1>
              <p className="text-xs text-slate-300">{userEmail}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <nav className="hidden items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 sm:flex">
              {navItems.map(([key, path, label, Icon]) => (
                <Link
                  key={key}
                  href={financePath(path)}
                  className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[10px] font-semibold uppercase tracking-[0.16em] transition duration-200 ${
                    activeSection === key ? "bg-cyan-300/15 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.18)]" : "text-slate-300 hover:bg-white/10 hover:text-white"
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
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-100 shadow-[0_12px_28px_rgba(2,6,23,0.20)] transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-cyan-100 active:translate-y-0"
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
               className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border text-[10px] font-semibold uppercase tracking-[0.16em] transition duration-200 ${
                activeSection === key ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300"
              }`}
            >
              <Icon size={14} />
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="w-full animate-[financeFade_260ms_ease-out] p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
