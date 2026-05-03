"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default function AdminHome() {
  const [adminEmail, setAdminEmail] = useState("Loading...");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setAdminEmail(data.user.email);
    });
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto pb-10">
      <header className="mb-8 border-b border-rose-100 pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-800">
          Welcome <span className="text-[#FC687D]">Back 👋</span>
        </h1>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">
          Admin Panel • {adminEmail}
        </p>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          { icon:"📋", label:"Live Orders", desc:"View and manage incoming orders in real time.", href:"/admin/orders" },
          { icon:"🧩", label:"Menu Builder", desc:"Add, edit, and organize your menu items and categories.", href:"/admin/menu" },
          { icon:"🎁", label:"Promo Codes", desc:"Create and manage discount codes for customers.", href:"/admin/promos" },
          { icon:"⚙️", label:"Settings", desc:"Update store info, hours, delivery fees, and more.", href:"/admin/settings" },
          { icon:"👥", label:"Accounts", desc:"Manage staff access and account settings.", href:"/admin/accounts" },
        ].map(card => (
          <Link key={card.href} href={card.href} className="group bg-white rounded-3xl border border-rose-50 shadow-sm p-8 hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="text-4xl mb-4 group-hover:scale-110 transition-transform origin-left relative z-10">{card.icon}</div>
            <h3 className="font-extrabold text-slate-800 mb-2 group-hover:text-[#FC687D] transition-colors relative z-10">{card.label}</h3>
            <p className="text-slate-500 text-sm font-medium leading-relaxed relative z-10">{card.desc}</p>
          </Link>
        ))}

        {/* Public Site Preview Card */}
        <div className="bg-[#FFF5F7] rounded-3xl p-8 border border-rose-100 flex flex-col justify-between relative overflow-hidden group hover:-translate-y-1 transition-all duration-300">
          <div>
            <div className="text-4xl mb-4 group-hover:scale-110 transition-transform origin-left">🌐</div>
            <h3 className="font-extrabold text-[#FC687D] mb-2">Public Site</h3>
            <p className="text-slate-500 text-sm font-medium leading-relaxed">Preview your public-facing menu and ordering pages.</p>
          </div>
          <div className="mt-6 flex gap-3 flex-wrap relative z-10">
            <Link href="/" target="_blank" className="px-5 py-2.5 bg-white text-[#FC687D] border border-rose-100 text-[10px] font-bold uppercase tracking-widest hover:bg-[#FC687D] hover:text-white transition-colors rounded-full shadow-sm">Home</Link>
            <Link href="/menu" target="_blank" className="px-5 py-2.5 bg-white text-[#FC687D] border border-rose-100 text-[10px] font-bold uppercase tracking-widest hover:bg-[#FC687D] hover:text-white transition-colors rounded-full shadow-sm">Menu</Link>
          </div>
        </div>
      </div>
    </div>
  );
}