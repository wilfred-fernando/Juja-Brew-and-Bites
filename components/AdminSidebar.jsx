"use client";

import Link from "next/link";

export default function AdminSidebar({
  mobileOpen,
  setMobileOpen,
  pathname,
  userEmail,
  handleLogout,
}) {

  const MENU = [
    { name: "Dashboard", path: "/admin", icon: "🏠" },
    { name: "Bookings", path: "/admin/bookings", icon: "📅" },
    { name: "Calendar", path: "/admin/calendar", icon: "🗓️" },
    { name: "Live Orders", path: "/admin/live-orders", icon: "📋" },
    { name: "POS System", path: "/admin/pos-admin", icon: "🛒" },
    { name: "Menu", path: "/admin/menu", icon: "🧩" },
    { name: "Loyalty Program", path: "/admin/loyalty", icon: "⭐" },
    { name: "Promo Codes", path: "/admin/promos", icon: "🎁" },
    { name: "Settings", path: "/admin/settings", icon: "⚙️" },
  ];

  return (
    <>
      {/* MOBILE BACKDROP */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-white border-r transition-transform ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <div className="p-6 flex justify-between items-center">
          <strong>ADMIN</strong>
          <button onClick={() => setMobileOpen(false)}>✕</button>
        </div>

        <nav className="p-4 space-y-2">
          {MENU.map((item) => {
            const isActive = pathname.startsWith(item.path);

            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={() => setMobileOpen(false)}
                className={`flex gap-3 p-3 rounded-lg ${
                  isActive
                    ? "bg-[#FC687D] text-white"
                    : "text-slate-600 hover:bg-rose-50"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t">
          <p className="text-xs mb-2">{userEmail}</p>

          <button
            onClick={handleLogout}
            className="w-full border p-2 rounded"
          >
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
``