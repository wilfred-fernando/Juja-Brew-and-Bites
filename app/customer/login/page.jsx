"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from '@/lib/supabase'; 

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

export default function Login() {
  const pathname = usePathname();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  // Detect which portal this is based on the folder path
  const isAdminPortal = pathname.includes('/admin') || pathname.includes('/pos');

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          if (isAdminPortal) {
            window.location.href = "/admin/pos";
          } else {
            router.push("/customer");
          }
          return;
        }
      } catch (e) {
        console.error("Session check error:", e);
      } finally {
        // FORCE STOP the spinner after a tiny delay
        setTimeout(() => setLoading(false), 300);
      }
    };
    checkSession();
  }, [isAdminPortal, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); 
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });
      
      if (authError) throw authError;

      if (isAdminPortal) {
        window.location.href = "/admin/pos";
      } else {
        router.push("/customer");
      }
    } catch (err) {
      setError(err.message || "Invalid credentials.");
      setLoading(false); 
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#FC687D]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FFF5F7]">
      <div className="relative z-10 px-6 py-8 flex items-center justify-between max-w-7xl mx-auto w-full">
        <Link href="/">
          <img src={LOGO} alt="Juja" className="h-14 md:h-16 w-auto object-contain" />
        </Link>
        <Link href="/" className="text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:text-[#FC687D] bg-white px-5 py-2.5 rounded-full border border-rose-100 shadow-sm transition-all">
          ← Back to Website
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 relative z-10">
        <div className="w-full max-w-md">
          {/* TABS ARE GONE FROM HERE */}
          
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full text-[10px] font-normal uppercase tracking-[0.25em] bg-rose-50 text-[#FC687D] border border-rose-100">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FC687D] animate-pulse" />
              {isAdminPortal ? "Admin Access" : "Customer Portal"}
            </div>
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight mb-2">Welcome Back</h1>
          </div>

          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-rose-50">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-2 uppercase tracking-tighter">Email</label>
                <input type="email" required value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm focus:border-[#FC687D] outline-none transition-all"
                  placeholder="you@example.com" />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-2 uppercase tracking-tighter">Password</label>
                <input type="password" required value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm focus:border-[#FC687D] outline-none transition-all"
                  placeholder="••••••••" />
              </div>

              {error && (
                <div className="rounded-2xl px-5 py-3.5 text-[12px] font-bold bg-red-50 text-red-500 border border-red-100">
                  ⚠️ {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-4 mt-2 bg-[#FC687D] text-white rounded-full text-[13px] font-bold uppercase tracking-widest hover:bg-rose-500 transition-all shadow-lg">
                Sign In →
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}