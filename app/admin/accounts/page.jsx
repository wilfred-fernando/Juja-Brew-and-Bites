"use client";
import Link from "next/link";

export default function Accounts() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300 pb-20">
      <header className="mb-8 border-b border-rose-100 pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-800">Staff <span className="text-[#FC687D]">Accounts</span></h1>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Manage staff access and permissions</p>
      </header>

      <div className="bg-white rounded-3xl border border-rose-50 shadow-sm p-8 md:p-10">
        <div className="flex items-center justify-between mb-8 border-b border-rose-50 pb-6">
          <h2 className="font-bold text-[#FC687D] text-xs uppercase tracking-[0.2em]">Active Accounts</h2>
          <span className="px-4 py-1.5 bg-rose-50 text-[#FC687D] rounded-full text-[9px] font-normal uppercase tracking-widest">Managed via Supabase</span>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-start gap-5 p-6 bg-[#FFF5F7] rounded-2xl border border-rose-100">
            <div className="text-3xl bg-white w-12 h-12 rounded-full flex items-center justify-center shadow-sm">👤</div>
            <div>
              <p className="font-extrabold text-slate-800">Admin Account</p>
              <p className="text-slate-500 text-sm mt-1 font-medium">Full access to all pages, live orders, and menu builder functions.</p>
            </div>
          </div>
          
          <div className="flex items-start gap-5 p-6 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="text-3xl bg-white w-12 h-12 rounded-full flex items-center justify-center shadow-sm text-slate-400">ℹ️</div>
            <div>
              <p className="font-extrabold text-slate-800">How to add staff</p>
              <p className="text-slate-500 text-sm mt-1 font-medium leading-relaxed">Staff can sign up using the Login page. If you are using Supabase Auth, new accounts are managed directly through your Supabase project dashboard.</p>
            </div>
          </div>
        </div>
        
        <div className="mt-8 pt-8 border-t border-rose-50">
          <Link href="/login" className="px-8 py-3.5 bg-white border border-slate-200 text-slate-600 font-bold uppercase tracking-widest rounded-full text-[10px] hover:border-[#FC687D] hover:text-[#FC687D] hover:bg-rose-50 transition-colors inline-block shadow-sm">
            Go to Login Page →
          </Link>
        </div>
      </div>
    </div>
  );
}