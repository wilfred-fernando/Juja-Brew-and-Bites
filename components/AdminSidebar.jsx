"use client";

import { useState } from "react";

export default function AdminSidebar({ current, onChange }) {

  const [open, setOpen] = useState(false);

  const MENU = [
    { key: "dashboard", label: "Dashboard", icon: "🏠" },
    { key: "bookings", label: "Bookings", icon: "📅" },
    { key: "calendar", label: "Calendar View", icon: "🗓️" },
    { key: "packages", label: "Packages", icon: "📦" },
    { key: "reports", label: "Reports", icon: "📊" },
    { key: "settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <>
      {/* ================= MOBILE TOGGLE ================= */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 w-10 h-10 rounded-full bg-white border shadow flex items-center justify-center"
      >
        ☰
      </button>

      {/* ================= BACKDROP (mobile) ================= */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ================= SIDEBAR ================= */}
      <aside
  className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-white border-r border-rose-100 flex flex-col transition-transform duration-300 md:translate-x-0 ${
    mobileOpen ? "translate-x-0" : "-translate-x-full"
  }`}
>

  {/* HEADER */}
  <div className="p-8 border-b border-rose-50 flex justify-between items-center">
    <img src={LOGO} className="h-10 object-contain" />
    <button onClick={() => setMobileOpen(false)} className="md:hidden text-rose-400 font-bold">
      ✕
    </button>
  </div>

  {/* 🔔 NOTIFICATION BAR */}
  <div className="px-6 py-3 flex items-center justify-between border-b border-rose-50">

    <p className="text-[10px] uppercase tracking-widest text-slate-400">
      Admin Panel
    </p>

    <div className="flex items-center gap-3">

      {/* 🔔 Notification Bell */}
      <div className="relative cursor-pointer">
        <span className="text-lg">🔔</span>

        {/* 🔴 Badge (replace value with real count) */}
        <div className="absolute -top-1 -right-1 text-[8px] bg-red-500 text-white px-1.5 rounded-full">
          3
        </div>
      </div>

    </div>
  </div>

  {/* NAV */}
  <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">

    {navItems.map((item) => {

      const isActive =
        item.path === "/admin"
          ? pathname === "/admin" || pathname === "/"
          : pathname.startsWith(item.path);

      return (
        <Link
          key={item.name}
          href={item.path}
          onClick={() => setMobileOpen(false)}
          className={`flex items-center gap-4 px-5 py-4 rounded-2xl font-bold transition-all relative ${
            isActive
              ? "bg-[#FFF5F7] text-[#FC687D]"
              : "text-slate-600 hover:bg-rose-50 hover:text-[#FC687D]"
          }`}
        >

          {/* ICON */}
          <span className="text-xl">{item.icon}</span>

          {/* LABEL */}
          <span className="text-sm">{item.name}</span>

          {/* ✅ ACTIVE BAR */}
          {isActive && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#FC687D] rounded-r" />
          )}

          {/* ✅ BOOKING BADGE */}
          {item.path.includes("bookings") && (
            <span className="ml-auto text-[9px] bg-red-500 text-white px-2 py-0.5 rounded-full">
              5
            </span>
          )}

        </Link>
      );
    })}

  </nav>

  {/* FOOTER */}
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

    </>
  );
}