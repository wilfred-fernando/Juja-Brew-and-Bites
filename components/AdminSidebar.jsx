"use client";

import { useState } from "react";
import Link from "next/link";

const LOGO =
  "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

export default function AdminSidebar({
  pathname,
  userEmail,
  handleLogout,
}) {
  const [open, setOpen] = useState(false);

  const MENU = [
    { name: "Dashboard", path: "/admin", icon: "🏠" },
    { name: "Bookings", path: "/admin/bookings", icon: "📅" },
    { name: "Calendar", path: "/admin/calendar", icon: "🗓️" },
    { name: "Packages", path: "/admin/packages", icon: "📦" },
    { name: "Reports", path: "/admin/reports", icon: "📊" },
    { name: "Settings", path: "/admin/settings", icon: "⚙️" },
  ];

  return (
    <>
      {/* MOBILE BUTTON */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 w-10 h-10 rounded-full bg-white border shadow flex items-center justify-center"
      >
        ☰
      </button>

      {/* BACKDROP */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-white border-r flex flex-col transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        {/* HEADER */}
        <div className="p-6 border-b flex justify-between items-center">
          <img src={LOGO} className="h-8" />

          <button onClick={() => setOpen(false)} className="md:hidden">
            ✕
          </button>
        </div>

        {/* NAV */}
        <nav className="flex-1 p-4 space-y-2">
          {MENU.map((item) => {
            const isActive = pathname?.startsWith(item.path);

            return (
              <Link
                key={item.name}
                href={item.path}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 p-3 rounded-xl ${
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

        {/* FOOTER */}
        <div className="p-4 border-t">
          <p className="text-xs text-slate-500 mb-2">
            {userEmail || "Admin"}
          </p>

          <button
            onClick={handleLogout}
            className="w-full py-2 border rounded-lg"
          >
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}