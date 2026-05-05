"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from '@/lib/supabase'; 

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

export default function Login() {
  const [portal, setPortal] = useState("customer"); // "customer" | "admin"
  const [mode, setMode] = useState("login");         // "login" | "signup"
  const [form, setForm] = useState({ email: "", password: "", full_name: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const switchPortal = (p) => { 
    setPortal(p); 
    setMode("login"); 
    setError(""); 
    setForm({ email: "", password: "", full_name: "" }); 
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); 
    setLoading(true);

    try {
      // ─── 1. LOGIN FLOW ───
      if (mode === "login") {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        
        if (authError) throw authError;

        if (portal === "admin") {
          console.log("Forcing entry to Admin page...");
          window.location.href = "/admin/pos"; // <-- Forces a hard browser jump to the POS
          return;
        }
      }
      
      // ─── 2. SIGNUP FLOW ───
      else if (mode === "signup") {
        const { error: authError } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: { 
              full_name: form.full_name,
              role: "customer" 
            }
          }
        });
        
        if (authError) throw authError;
      }

      // Success! Send customers to their dashboard
      router.push("/customer");

    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally { 
      setLoading(false); 
    }
  };

  const isAdmin = portal === "admin";

  return (
    <div className="min-h-screen flex flex-col bg-[#FFF5F7] animate-in fade-in duration-500" style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>

      {/* Subtle Background Elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none opacity-40"
        style={{ background: "radial-gradient(ellipse,rgba(252,104,125,0.15) 0%,transparent 70%)", filter: "blur(50px)" }} />

      {/* Top bar */}
      <div className="relative z-10 px-6 py-6 md:py-8 flex items-center justify-between max-w-7xl mx-auto w-full">
        <Link href="/">
          <img src={LOGO} alt="Juja" className="h-14 md:h-16 w-auto object-contain transition-transform hover:scale-105" />
        </Link>
        <Link href="/" className="text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:text-[#FC687D] bg-white px-5 py-2.5 rounded-full border border-rose-100 shadow-sm transition-all">
          ← Back to Website
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-8 relative z-10">
        <div className="w-full max-w-md">

          {/* ── PORTAL TOGGLE ── */}
          <div className="flex bg-white rounded-full p-1.5 mb-8 shadow-sm border border-rose-50">
            {[
              { id: "customer", icon: "👤", label: "Customer" },
              { id: "admin",    icon: "🔐", label: "Admin" },
            ].map(p => (
              <button key={p.id} onClick={() => switchPortal(p.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full transition-all duration-300 ${
                  portal === p.id 
                    ? "bg-[#FC687D] text-white shadow-md shadow-rose-200" 
                    : "text-slate-500 hover:bg-rose-50 hover:text-[#FC687D]"
                }`}>
                <span className="text-lg">{p.icon}</span>
                <span className="text-[11px] font-bold uppercase tracking-widest">{p.label}</span>
              </button>
            ))}
          </div>

          {/* ── HEADER ── */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full text-[10px] font-normal uppercase tracking-[0.25em] bg-rose-50 text-[#FC687D] border border-rose-100">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FC687D] animate-pulse" />
              {isAdmin ? "Admin Portal" : "Customer Portal"}
            </div>
            
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight mb-2 transition-all">
              {mode === "login" ? "Welcome Back" : "Create Account"}
            </h1>
            
            <p className="text-slate-500 text-sm font-medium">
              {isAdmin
                ? "Sign in to manage admin portal."
                : mode === "login" 
                  ? "Sign in to your Juja account." 
                  : "Join the Juja loyalty program."}
            </p>
          </div>

          {/* ── MAIN CARD ── */}
          <div className="bg-white rounded-[32px] p-6 md:p-8 shadow-[0_8px_30px_rgba(252,104,125,0.06)] border border-rose-50 relative overflow-hidden">
            
            {/* Sign In / Sign Up sub-tabs (Customers only) */}
            {!isAdmin && (
              <div className="flex bg-[#FFF9FA] rounded-full p-1.5 mb-8 border border-rose-50">
                {[["login","Sign In"],["signup","Sign Up"]].map(([id, lbl]) => (
                  <button key={id} onClick={() => { setMode(id); setError(""); }}
                    className={`flex-1 py-2.5 rounded-full text-xs font-bold transition-all duration-200 ${
                      mode === id 
                        ? "bg-white text-[#FC687D] shadow-sm border border-rose-100" 
                        : "text-slate-500 hover:text-[#FC687D]"
                    }`}>{lbl}</button>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5 animate-in fade-in duration-300">
              
              {/* Full Name Field (Signup only) */}
              {!isAdmin && mode === "signup" && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-2">Full Name</label>
                  <input type="text" required value={form.full_name}
                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-[#FC687D] focus:bg-white focus:ring-1 focus:ring-[#FC687D] transition-all"
                    placeholder="e.g. Maria Clara" />
                </div>
              )}

              {/* Email Field */}
              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-2">Email Address</label>
                <input type="email" required value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-[#FC687D] focus:bg-white focus:ring-1 focus:ring-[#FC687D] transition-all"
                  placeholder="you@example.com" />
              </div>

              {/* Password Field */}
              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-2 ml-2">Password</label>
                <input type="password" required value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-[#FC687D] focus:bg-white focus:ring-1 focus:ring-[#FC687D] transition-all"
                  placeholder="••••••••" />
              </div>

              {/* Error Message */}
              {error && (
                <div className="rounded-2xl px-5 py-3.5 text-[13px] font-bold flex items-start gap-3 bg-red-50 text-red-500 border border-red-100 animate-in slide-in-from-top-2">
                  <span className="text-lg leading-none">⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Submit Button */}
              <button type="submit" disabled={loading}
                className="w-full py-4 mt-2 bg-[#FC687D] text-white rounded-full text-[13px] font-bold uppercase tracking-widest hover:bg-rose-500 transition-all shadow-[0_8px_20px_rgba(252,104,125,0.3)] hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0">
                {loading ? "Please wait..." : mode === "login" ? "Sign In →" : "Create Account →"}
              </button>
            </form>

            {/* Customer mode — toggle link */}
            {!isAdmin && (
              <p className="text-center text-slate-500 text-[13px] font-medium mt-6">
                {mode === "login" ? "Don't have an account? " : "Already a member? "}
                <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
                  className="text-[#FC687D] font-bold hover:underline underline-offset-4">
                  {mode === "login" ? "Sign Up Free" : "Sign In"}
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}