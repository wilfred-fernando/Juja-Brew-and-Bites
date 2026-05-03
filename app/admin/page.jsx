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
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto">
      <header className="mb-8 border-b border-gray-200 pb-6">
        <h1 className="text-3xl font-bold uppercase tracking-tighter text-[#1A1A1A]">
          Welcome <span className="text-[#1EBBA3] font-light">Back</span>
        </h1>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">
          Admin Panel • {adminEmail}
        </p>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          { icon:"📋", label:"Live Orders", desc:"View and manage incoming orders in real time.", href:"/admin/orders" },
          { icon:"🧩", label:"Menu Builder", desc:"Add, edit, and organize your menu items and categories.", href:"/admin/menu" },
          { icon:"🎁", label:"Promo Codes", desc:"Create and manage discount codes for customers.", href:"/admin/promos" },
          { icon:"⚙️", label:"Settings", desc:"Update store info, hours, delivery fees, and more.", href:"/admin/settings" },
          { icon:"👥", label:"Accounts", desc:"Manage staff access and account settings.", href:"/admin/account" },
        ].map(card => (
          <Link key={card.href} href={card.href} className="group bg-white rounded-lg border border-gray-100 shadow-sm p-8 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#1EBBA3] opacity-0 -translate-x-full group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"></div>
            <div className="text-4xl mb-4 group-hover:scale-110 transition-transform origin-left">{card.icon}</div>
            <h3 className="font-bold text-[#1A1A1A] mb-2 uppercase tracking-wide group-hover:text-[#1EBBA3] transition-colors">{card.label}</h3>
            <p className="text-gray-400 text-xs font-medium leading-relaxed">{card.desc}</p>
          </Link>
        ))}

        {/* Public Site Preview Card */}
        <div className="bg-[#1A1A1A] rounded-lg p-8 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-32 h-32 bg-[#1EBBA3] opacity-10 rounded-full blur-2xl"></div>
          <div>
            <div className="text-4xl mb-4">🌐</div>
            <h3 className="font-bold text-white mb-2 uppercase tracking-wide">Public Site</h3>
            <p className="text-gray-400 text-xs font-medium leading-relaxed">Preview your public-facing menu and ordering pages.</p>
          </div>
          <div className="mt-6 flex gap-3 flex-wrap relative z-10">
            <Link href="/" target="_blank" className="px-5 py-2 bg-[#1EBBA3] text-white text-[10px] font-bold uppercase tracking-widest hover:bg-[#159a85] transition-colors rounded-sm">Home</Link>
            <Link href="/menu" target="_blank" className="px-5 py-2 bg-transparent border border-gray-600 text-gray-300 text-[10px] font-bold uppercase tracking-widest hover:border-white hover:text-white transition-colors rounded-sm">Menu</Link>
          </div>
        </div>
      </div>
    </div>
  );
}