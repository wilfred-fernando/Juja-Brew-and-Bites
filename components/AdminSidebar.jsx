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
        className={`fixed md:relative z-50 md:z-0 top-0 left-0 h-full w-64 bg-white border-r border-rose-50 shadow-sm transform transition-transform duration-200
        ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        {/* HEADER */}
        <div className="px-6 py-6 border-b border-rose-50">
          <p className="text-[10px] uppercase tracking-widest text-slate-400">
            Admin Panel
          </p>
          <h2 className="text-lg font-semibold text-slate-800">
            Juja Booking
          </h2>
        </div>

        {/* MENU */}
        <div className="p-4 space-y-1">

          {MENU.map((item) => {
            const active = current === item.key;

            return (
              <button
                key={item.key}
                onClick={() => {
                  onChange(item.key);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${
                  active
                    ? "bg-rose-50 text-[#FC687D] font-semibold"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </button>
            );
          })}

        </div>

        {/* FOOTER */}
        <div className="absolute bottom-0 left-0 w-full p-4 border-t border-rose-50">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-red-500 hover:bg-red-50">
            🚪 Logout
          </button>
        </div>
      </aside>
    </>
  );
}