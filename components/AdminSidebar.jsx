"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Banknote,
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
        { name: "Payroll", path: "/admin/payroll", icon: Banknote },
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
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-white border-r flex flex-col transition-transform ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* HEADER */}
        <div className="p-6 border-b flex items-center justify-between">
          <img src={LOGO} className="h-8 object-contain" alt="logo" />

          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* NAV */}
        <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
          {SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="text-xs text-gray-400 mb-2 uppercase">
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
                          className="flex justify-between w-full px-3 py-2 rounded hover:bg-gray-100"
                        >
                          <span className="flex items-center gap-2">
                            <Icon className="h-4 w-4 shrink-0" />
                            <span>{item.name}</span>
                          </span>
                          {posOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>

                        {posOpen && (
                          <div className="ml-4 space-y-1">
                            {item.submenu.map((sub, i) => {
                              if (sub.type === "label") {
                                return (
                                  <p key={i} className="text-xs text-gray-400 mt-2">
                                    {sub.name}
                                  </p>
                                );
                              }

                              return (
                                <Link
                                  key={sub.path}
                                  href={sub.path}
                                  onClick={() => setMobileOpen(false)}
                                  className={`block px-3 py-2 text-sm rounded ${
                                    isActive(sub.path)
                                      ? "bg-rose-100 text-[#FC687D]"
                                      : "text-gray-600 hover:bg-gray-100"
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
                      className={`flex gap-2 px-3 py-2 rounded ${
                        active
                          ? "bg-rose-50 text-[#FC687D]"
                          : "text-gray-600 hover:bg-gray-100"
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
        <div className="p-4 border-t">
          <div className="text-xs text-gray-500 mb-2">{userEmail}</div>
          <button
            onClick={onLogout}
            className="w-full border py-2 rounded"
          >
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
