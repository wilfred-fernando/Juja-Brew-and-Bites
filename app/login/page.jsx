"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export default function LoginPage() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", full_name: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); 
    setLoading(true);

    try {
      let authData, authError;

      if (mode === "login") {
        // SUPABASE: Log In
        const response = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        authData = response.data;
        authError = response.error;
      } else {
        // SUPABASE: Sign Up
        const response = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: { full_name: form.full_name }
          }
        });
        authData = response.data;
        authError = response.error;
      }

      if (authError) throw authError;

      // Ensure our Next.js Proxy recognizes the login
      if (authData?.session) {
        document.cookie = "juja-admin-auth=true; path=/; SameSite=Lax; max-age=86400";
        window.location.href = "/admin"; // Hard redirect to clear Next.js cache
      } else if (mode === "signup") {
        setError("Account created! Please check your email to verify.");
      }

    } catch (err) {
      setError(err.message || "Invalid email or password.");
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <div className="min-h-screen flex" style={{ fontFamily:"'Inter',system-ui,sans-serif" }}>
      {/* Left — dark brand panel */}
      <div className="hidden lg:flex flex-col items-center justify-center w-5/12 relative overflow-hidden"
        style={{ background:"linear-gradient(160deg,#0c0c0c 0%,#0a1a18 60%,#0c0c0c 100%)" }}>
        
        {/* Teal Glow Effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 opacity-20 pointer-events-none"
          style={{ background:"radial-gradient(circle,#1EBBA3,transparent 65%)", filter:"blur(60px)" }} />
        
        <div className="absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage:"radial-gradient(rgba(255,255,255,0.6) 1px,transparent 1px)", backgroundSize:"24px 24px" }} />
        
        <div className="relative z-10 text-center px-10">
          <img src={LOGO} alt="Juja" className="h-28 w-auto object-contain mx-auto mb-8 brightness-0 invert opacity-85 drop-shadow-xl" />
          <h2 className="text-white text-2xl font-black mb-3 tracking-tight uppercase">Juja <span className="text-[#1EBBA3]">Merchant</span></h2>
          <p className="text-neutral-500 text-sm leading-relaxed max-w-xs mx-auto mb-10">
            Manage orders, update your menu, create promos, and run your store — all in one place.
          </p>
          
          <div className="space-y-3 text-left inline-block">
            {[
              ["📋", "Live order tracking"],
              ["🧩", "Full menu management"],
              ["🎁", "Promo code engine"],
              ["⚙️", "Store settings & hours"],
              ["👥", "Staff accounts"],
            ].map(([ic, txt]) => (
              <div key={txt} className="flex items-center gap-3 text-neutral-400 text-sm font-medium tracking-wide">
                <span className="text-lg">{ic}</span><span>{txt}</span>
              </div>
            ))}
          </div>
        </div>
        
        <Link href="/" className="absolute bottom-8 text-neutral-600 text-xs font-bold hover:text-[#1EBBA3] transition tracking-widest uppercase">
          ← Back to Website
        </Link>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-neutral-50">
        
        {/* Mobile logo */}
        <div className="lg:hidden mb-8 text-center">
          <Link href="/">
            <img src={LOGO} alt="Juja" className="h-20 object-contain mx-auto" style={{ filter: "invert(1)" }} />
          </Link>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-3xl font-black text-neutral-900 tracking-tight mb-1 uppercase">
              {mode === "login" ? "Welcome back" : "Create account"}
            </h1>
            <p className="text-neutral-400 text-sm font-medium tracking-wide">
              {mode === "login" ? "Sign in to access the admin panel" : "Register a new staff account"}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex bg-neutral-200/60 rounded-xl p-1 mb-7">
            {[["login","Sign In"],["signup","Sign Up"]].map(([id,lbl]) => (
              <button key={id} type="button" onClick={() => { setMode(id); setError(""); }}
                className={`flex-1 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all duration-200 ${
                  mode === id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-400 hover:text-neutral-600"
                }`}>
                {lbl}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-[10px] font-black text-neutral-500 mb-1.5 uppercase tracking-widest">Full Name</label>
                <input type="text" required value={form.full_name}
                  onChange={e => setForm({...form, full_name:e.target.value})}
                  className="w-full bg-white border border-neutral-200 rounded-lg px-4 py-3 text-neutral-900 text-sm font-semibold
                    placeholder-neutral-300 focus:outline-none focus:ring-2 focus:ring-[#1EBBA3]/40 focus:border-[#1EBBA3] transition-all"
                  placeholder="Your full name" />
              </div>
            )}
            
            <div>
              <label className="block text-[10px] font-black text-neutral-500 mb-1.5 uppercase tracking-widest">Email</label>
              <input type="email" required value={form.email}
                onChange={e => setForm({...form, email:e.target.value})}
                className="w-full bg-white border border-neutral-200 rounded-lg px-4 py-3 text-neutral-900 text-sm font-semibold
                  placeholder-neutral-300 focus:outline-none focus:ring-2 focus:ring-[#1EBBA3]/40 focus:border-[#1EBBA3] transition-all"
                placeholder="admin@juja.com" />
            </div>
            
            <div>
              <label className="block text-[10px] font-black text-neutral-500 mb-1.5 uppercase tracking-widest">Password</label>
              <input type="password" required value={form.password}
                onChange={e => setForm({...form, password:e.target.value})}
                className="w-full bg-white border border-neutral-200 rounded-lg px-4 py-3 text-neutral-900 text-sm font-semibold
                  placeholder-neutral-300 focus:outline-none focus:ring-2 focus:ring-[#1EBBA3]/40 focus:border-[#1EBBA3] transition-all"
                placeholder="••••••••" />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-500 text-xs font-bold uppercase tracking-widest flex items-start gap-2">
                <span>⚠</span><span>{error}</span>
              </div>
            )}
            
            <button type="submit" disabled={loading}
              className="w-full py-3.5 rounded-lg font-black text-sm uppercase tracking-widest text-white
                hover:-translate-y-0.5 hover:shadow-[0_8px_25px_rgba(30,187,163,0.4)] transition-all duration-300
                disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              style={{ background:"linear-gradient(135deg,#159a85,#1EBBA3)" }}>
              {loading ? "Processing..." : mode === "login" ? "Secure Login →" : "Create Account →"}
            </button>
          </form>

          <p className="text-center text-neutral-400 text-xs mt-6 font-semibold tracking-wide">
            {mode === "login" ? "No account yet? " : "Have an account? "}
            <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
              className="text-[#1EBBA3] font-black hover:underline transition uppercase tracking-widest">
              {mode === "login" ? "Sign Up" : "Sign In"}
            </button>
          </p>

          <div className="mt-8 text-center">
            <Link href="/" className="text-neutral-300 text-[10px] font-bold hover:text-[#1EBBA3] transition tracking-widest uppercase">
              ← Back to Homepage
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}