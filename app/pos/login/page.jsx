"use client";

import { useState, useEffect } from "react";
import { supabase } from '@/lib/supabase'; 
import { useRouter } from "next/navigation"; // 1. Import the Next.js router

export default function POSLoginPage() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const router = useRouter(); // 2. Initialize the router

  useEffect(() => {
    setMounted(true);

    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          // 3. Use router.replace to prevent users from hitting the 'back' button to return to login
          router.replace("/");
          return;
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, [router]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    try {
      const { error: authError } = await supabase.auth.signInWithPassword(form);
      if (authError) throw authError;
      
      // 4. Smooth internal routing to the POS Dashboard
      router.replace("/");
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 items-center justify-center p-4">
      <div className="w-full max-w-md bg-white p-10 rounded-[40px] shadow-xl border border-emerald-100">
        <div className="text-center mb-8">
            <span className="bg-emerald-50 text-emerald-500 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                Juja Staff Only
            </span>
            <h1 className="text-3xl font-black text-slate-800 mt-4">Cashier Terminal</h1>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <input 
            type="email" 
            placeholder="Email Address"
            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-emerald-400 transition-all"
            onChange={(e) => setForm({...form, email: e.target.value})}
            required
          />
          <input 
            type="password" 
            placeholder="Password"
            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-emerald-400 transition-all"
            onChange={(e) => setForm({...form, password: e.target.value})}
            required
          />
          {error && <p className="text-red-500 text-xs font-bold text-center">⚠️ {error}</p>}
          <button type="submit" disabled={loading} className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 transition-colors text-white rounded-full font-bold shadow-lg shadow-emerald-200">
            {loading ? "Verifying..." : "Open Register →"}
          </button>
        </form>
      </div>
    </div>
  );
}