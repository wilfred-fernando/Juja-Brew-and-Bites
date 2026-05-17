"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const navItems = [
  { name: "Dashboard", path: "/admin", icon: "🏠" },

  // ✅ NEW BOOKING HUB (your system)
  {
    name: "Bookings",
    path: "/admin/bookings",
    icon: "📅",
    submenu: [
      { name: "All Bookings", path: "/admin/bookings" },
      { name: "Calendar View", path: "/admin/bookings/calendar" },
    ],
  },

  {
    name: "Reports",
    path: "/admin/reports",
    icon: "📊",
    submenu: [
      { name: "Sales Summary", path: "/admin/reports/sales" },
      { name: "Sales by Item", path: "/admin/reports/items" },
      { name: "Sales by Category", path: "/admin/reports/categories" },
      { name: "Receipts", path: "/admin/reports/receipts" },
      { name: "Shifts", path: "/admin/reports/shifts" },
    ],
  },

  {
    name: "POS Admin",
    path: "/pos",
    icon: "🖥️",
    submenu: [
      { name: "Terminal Config", path: "/admin/pos/config" },
      { name: "Dining Options", path: "/admin/pos/dining" },
      { name: "Payment Types", path: "/admin/pos/payments" },
    ],
  },

  {
    name: "Items",
    path: "/admin/menu",
    icon: "🛍️",
    submenu: [
      { name: "Item Library", path: "/admin/menu/items" },
      { name: "Categories", path: "/admin/menu/categories" },
      { name: "Modifiers", path: "/admin/menu/modifiers" },
    ],
  },

  { name: "Loyalty", path: "/admin/loyalty", icon: "⭐" },
];

export default function Sidebar({ pendingCount = 0 }) {
  const pathname = usePathname();
  const [openSection, setOpenSection] = useState("");

  if (pathname.includes("/login")) return null;

  /* ✅ auto-open correct section */
  useEffect(() => {
    const active = navItems.find((item) =>
      pathname.startsWith(item.path)
    );
    if (active?.submenu) {
      setOpenSection(active.name);
    }
  }, [pathname]);

  /* ✅ fixed JS version (no TS error) */
  function toggleSection(name) {
    setOpenSection((prev) => (prev === name ? "" : name));
  }

  return (
    <aside className="w-64 bg-white border-r border-gray-100 flex flex-col h-screen sticky top-0 z-[100] overflow-hidden">

      {/* HEADER */}
      <div className="p-8 border-b border-gray-50 flex items-center gap-3 flex-shrink-0">
        <div className="w-8 h-8 bg-[#FC687D] rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-rose-100">
          J
        </div>
        <span className="font-black text-[10px] tracking-[0.3em] uppercase text-slate-800">
          Merchant Panel
        </span>
      </div>

      {/* NAV */}
      <nav className="flex-1 overflow-y-auto p-4 flex flex-col gap-1">

        {navItems.map((item) => {
          const hasSub = !!item.submenu;
          const isOpen = openSection === item.name;
          const isActive =
            pathname === item.path || pathname.startsWith(item.path);

          return (
            <div key={item.name} className="flex flex-col w-full">

              {/* ✅ MAIN ITEM */}
              {hasSub ? (
                <button
                  onClick={() => toggleSection(item.name)}
                  className={`flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all relative ${
                    isActive
                      ? "bg-[#FFF5F7] text-[#FC687D]"
                      : "text-slate-400 hover:bg-slate-50"
                  }`}
                >
                  {/* ✅ LEFT SIDE */}
                  <div className="flex items-center gap-4">
                    <span className="text-lg transition-transform group-hover:scale-110">
                      {item.icon}
                    </span>

                    <span className="text-[11px] font-black uppercase tracking-widest">
                      {item.name}
                    </span>

                    {/* ✅ Pending Badge (for bookings) */}
                    {item.name === "Bookings" && pendingCount > 0 && (
                      <span className="ml-2 text-[9px] bg-red-500 text-white px-2 py-0.5 rounded-full">
                        {pendingCount}
                      </span>
                    )}
                  </div>

                  {/* ✅ Arrow */}
                  <span
                    className={`text-[8px] transition-transform duration-300 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  >
                    ▼
                  </span>

                  {/* ✅ Left Active Bar */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#FC687D] rounded-r" />
                  )}
                </button>
              ) : (
                <Link
                  href={item.path}
                  className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all relative ${
                    isActive
                      ? "bg-[#FFF5F7] text-[#FC687D]"
                      : "text-slate-400 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-[11px] font-black uppercase tracking-widest">
                    {item.name}
                  </span>

                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#FC687D] rounded-r" />
                  )}
                </Link>
              )}

              {/* ✅ SUBMENU */}
              {hasSub && (
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    isOpen ? "max-h-96 opacity-100 mt-1 mb-4" : "max-h-0 opacity-0"
                  }`}
                >
                  <div className="ml-12 border-l border-slate-100 flex flex-col">
                    {item.submenu.map((sub) => {
                      const isSubActive = pathname === sub.path;

                      return (
                        <Link
                          key={sub.name}
                          href={sub.path}
                          className={`py-2.5 pl-5 pr-4 text-[10px] font-bold uppercase tracking-[0.15em] transition-all relative group ${
                            isSubActive
                              ? "text-slate-900"
                              : "text-slate-400 hover:text-slate-600"
                          }`}
                        >
                          <div
                            className={`absolute left-0 top-1/2 -translate-y-1/2 h-[1px] transition-all ${
                              isSubActive
                                ? "bg-[#FC687D] w-4"
                                : "bg-gray-200 group-hover:bg-gray-400"
                            }`}
                          />
                          {sub.name}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* FOOTER */}
      <div className="p-6 border-t border-slate-50 bg-white">
        <button className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 hover:text-red-400 transition-colors">
          Sign Out
        </button>
      </div>
    </aside>
  );
}