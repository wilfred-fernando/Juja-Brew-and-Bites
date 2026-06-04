"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  DollarSign,
  Gift,
  Home,
  Puzzle,
  Settings,
  ShoppingCart,
  Star,
  X,
} from "lucide-react";

const LOGO =
  "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

export default function AdminSidebar({
  pathname,
  mobileOpen,
  setMobileOpen,
  userEmail,
  onLogout,
}) {
  const [posOpen, setPosOpen] = useState(false);

  useEffect(() => {
    if (pathname?.startsWith("/admin/pos-admin")) {
      setPosOpen(true);
    }
  }, [pathname]);

  const SECTIONS = [
    {
      label: "Operations",
      items: [
        { name: "Dashboard", path: "/admin", icon: Home },
        { name: "Bookings", path: "/admin/bookings", icon: CalendarCheck },
        { name: "Calendar", path: "/admin/calendar", icon: CalendarDays },
        { name: "Live Orders", path: "/admin/orders", icon: ClipboardList },

        {
          name: "POS Admin",
          path: "/admin/pos-admin",
          icon: ShoppingCart,
          submenu: [
            { type: "label", name: "Reports" },
            { name: "Sales Summary", path: "/admin/pos-admin/reports/sales-summary" },
            { name: "Sales by Item", path: "/admin/pos-admin/reports/sales-by-item" },
            { name: "Sales by Category", path: "/admin/pos-admin/reports/sales-by-category" },
            { name: "Sales by Payment", path: "/admin/pos-admin/reports/sales-by-payment" },
            { name: "Receipts", path: "/admin/pos-admin/reports/receipts" },
            { name: "Discounts", path: "/admin/pos-admin/reports/discounts" },
            { name: "Shifts", path: "/admin/pos-admin/reports/shifts" },

            { type: "label", name: "Settings" },
            { name: "Payment Types", path: "/admin/pos-admin/settings/payment-types" },
            { name: "Receipt Settings", path: "/admin/pos-admin/settings/receipt-settings" },
            { name: "Open Tickets", path: "/admin/pos-admin/settings/open-tickets" },
            { name: "Kitchen Printers", path: "/admin/pos-admin/settings/kitchen-printers" },
            { name: "Dining Options", path: "/admin/pos-admin/settings/dining-options" },
            { name: "Discounts", path: "/admin/pos-admin/settings/discounts" },
            { name: "Stores & Admin Accounts", path: "/admin/pos-admin/settings/stores" },            
          ],
        },
      ],
    },
    {
      label: "Business",
      items: [
        { name: "Menu Builder", path: "/admin/menu", icon: Puzzle },
        { name: "Loyalty", path: "/admin/loyalty", icon: Star },
        { name: "Promos", path: "/admin/promos", icon: Gift },
        { name: "Sales", path: "/admin/sales", icon: DollarSign },
      ],
    },
    {
      label: "System",
      items: [{ name: "Settings", path: "/admin/settings", icon: Settings }],
    },
  ];

  const isActive = (path) => {
    if (path === "/admin") return pathname === "/admin";
    return pathname?.startsWith(path);
  };

  return (
    <>
      {/* MOBILE OVERLAY */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-white/10 bg-slate-950/86 text-slate-100 shadow-[0_28px_90px_rgba(2,6,23,0.40)] backdrop-blur-xl transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-white/10 p-6">
          <img src={LOGO} className="h-8 object-contain" alt="logo" />

          <button
            onClick={() => setMobileOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-cyan-100 md:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* NAV */}
        <nav className="flex-1 space-y-5 overflow-y-auto p-4">
          {SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                {section.label}
              </p>

              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = isActive(item.path);
                  const Icon = item.icon;

                  if (item.submenu) {
                    return (
                      <div key={item.name}>
                        <button
                          onClick={() => setPosOpen(!posOpen)}
                          className={`flex w-full justify-between rounded-xl px-3 py-2 text-sm transition duration-200 hover:-translate-y-0.5 hover:bg-cyan-300/10 hover:text-cyan-100 ${
                            active ? "bg-cyan-300/15 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.12)]" : "text-slate-300"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <Icon className="h-4 w-4 shrink-0" />
                            <span>{item.name}</span>
                          </span>
                          {posOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>

                        {posOpen && (
                          <div className="ml-4 mt-2 space-y-1 border-l border-white/10 pl-3">
                            {item.submenu.map((sub, i) => {
                              if (sub.type === "label") {
                                return (
                                  <p key={i} className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    {sub.name}
                                  </p>
                                );
                              }

                              return (
                                <Link
                                  key={sub.path}
                                  href={sub.path}
                                  onClick={() => setMobileOpen(false)}
                                  className={`block rounded-xl px-3 py-2 text-sm transition duration-200 hover:-translate-y-0.5 ${
                                    isActive(sub.path)
                                      ? "bg-cyan-300/15 text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.10)]"
                                      : "text-slate-400 hover:bg-cyan-300/10 hover:text-cyan-100"
                                  }`}
                                >
                                  {sub.name}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={`flex gap-2 rounded-xl px-3 py-2 text-sm transition duration-200 hover:-translate-y-0.5 ${
                        active
                          ? "bg-cyan-300/15 text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.10)]"
                          : "text-slate-300 hover:bg-cyan-300/10 hover:text-cyan-100"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* FOOTER */}
        <div className="border-t border-white/10 p-4">
          <div className="mb-2 truncate text-xs text-slate-400">{userEmail}</div>
          <button
            onClick={onLogout}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-100 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-cyan-100"
          >
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
