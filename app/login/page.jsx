"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";
const ROSE = { background: "linear-gradient(135deg,#e11d48,#f43f5e)" };
const ROSE_SHADOW = { ...ROSE, boxShadow: "0 8px 25px rgba(225,29,72,0.4)" };

export default function Login() {
  const [portal, setPortal] = useState("customer"); // "customer" | "admin"
  const [mode, setMode] = useState("login");         // "login" | "signup"
  const [form, setForm] = useState({ email: "", password: "", full_name: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter(); // Next.js router instead of useNavigate

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
      if (mode === "login") {
        // Supabase Login
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (authError) throw authError;

      } else {
        // Supabase Signup
        const { error: authError } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: { full_name: form.full_name } // Save name to user metadata
          }
        });
        if (authError) throw authError;
      }

      // Next.js routing push
      router.push(portal === "admin" ? "/admin" : "/customer");

    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally { 
      setLoading(false); 
    }
  };

  const isAdmin = portal === "admin";

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: "'Inter',system-ui,sans-serif", background: "linear-gradient(150deg,#0c0c0c 0%,#1a080c 50%,#0c0c0c 100%)" }}>

      {/* Dot grid bg */}
      <div className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.8) 1px,transparent 1px)", backgroundSize: "26px 26px" }} />
      {/* Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none opacity-10"
        style={{ background: "radial-gradient(ellipse,#f43f5e,transparent 65%)", filter: "blur(70px)" }} />

      {/* Top bar */}
      <div className="relative z-10 px-6 py-4 flex items-center justify-between">
        {/* Next.js Links use 'href' instead of 'to' */}
        <Link href="/">
          <img src={LOGO} alt="Juja" className="h-14 w-auto object-contain brightness-0 invert opacity-80" />
        </Link>
        <Link href="/" className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-600 hover:text-neutral-400 transition">
          ← Website
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-8 relative z-10">
        <div className="w-full max-w-sm">

          {/* ── PORTAL TOGGLE (big tabs) ── */}
          <div className="flex rounded-2xl overflow-hidden border border-white/10 mb-8"
            style={{ background: "rgba(255,255,255,0.04)" }}>
            {[
              { id: "customer", icon: "👤", label: "Customer" },
              { id: "admin",    icon: "🔐", label: "Admin / Staff" },
            ].map(p => (
              <button key={p.id} onClick={() => switchPortal(p.id)}
                className={`flex-1 flex flex-col items-center gap-1.5 py-4 transition-all duration-200 ${
                  portal === p.id ? "bg-white/10 text-white" : "text-neutral-600 hover:text-neutral-400"
                }`}>
                <span className="text-2xl">{p.icon}</span>
                <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${portal === p.id ? "text-white" : ""}`}>{p.label}</span>
                {portal === p.id && <span className="w-8 h-0.5 rounded-full bg-rose-400 mt-0.5" />}
              </button>
            ))}
          </div>

          {/* ── HEADER ── */}
          <div className="text-center mb-7">
            <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.25em]"
              style={{ border: "1px solid rgba(244,63,94,0.3)", color: "#fb7185", background: "rgba(244,63,94,0.07)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
              {isAdmin ? "Staff Portal" : "Customer Portal"}
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight mb-1.5">
              {mode === "login" ? "Welcome Back" : "Create Account"}
            </h1>
            <p className="text-neutral-500 text-sm">
              {isAdmin
                ? "Sign in to manage orders & menu"
                : mode === "login" ? "Sign in to your Juja account" : "Join the Juja loyalty program"}
            </p>
          </div>

          {/* ── CARD ── */}
          <div className="rounded-3xl p-7 border border-white/8"
            style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)" }}>

            {/* Sign In / Sign Up sub-tabs — customers only */}
            {!isAdmin && (
              <div className="flex bg-white/5 rounded-2xl p-1 mb-6 border border-white/8">
                {[["login","Sign In"],["signup","Sign Up"]].map(([id, lbl]) => (
                  <button key={id} onClick={() => { setMode(id); setError(""); }}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-200 ${
                      mode === id ? "bg-white text-neutral-900 shadow-lg" : "text-neutral-500 hover:text-neutral-300"
                    }`}>{lbl}</button>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Sign-up name field — customers only */}
              {!isAdmin && mode === "signup" && (
                <div>
                  <label className="block text-[10px] font-black text-neutral-500 mb-1.5 uppercase tracking-widest">Full Name</label>
                  <input type="text" required value={form.full_name}
                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-rose-500/40 transition-all"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
                    placeholder="Your full name" />
                </div>
              )}

              {[["email","Email","email","you@example.com"],["password","Password","password","••••••••"]].map(([k,l,t,p]) => (
                <div key={k}>
                  <label className="block text-[10px] font-black text-neutral-500 mb-1.5 uppercase tracking-widest">{l}</label>
                  <input type={t} required value={form[k]}
                    onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                    className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-rose-500/40 transition-all"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
                    placeholder={p} />
                </div>
              ))}

              {error && (
                <div className="rounded-xl px-4 py-3 text-xs flex items-start gap-2 text-red-300"
                  style={{ background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.25)" }}>
                  <span>⚠</span><span>{error}</span>
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-widest text-white hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 mt-1"
                style={ROSE_SHADOW}>
                {loading ? "Please wait…" : mode === "login" ? "Sign In →" : "Create Account →"}
              </button>
            </form>

            {/* Customer mode — toggle sign in/up link */}
            {!isAdmin && (
              <p className="text-center text-neutral-600 text-xs mt-5">
                {mode === "login" ? "No account yet? " : "Already a member? "}
                <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
                  className="text-rose-400 font-black hover:text-rose-300 transition">
                  {mode === "login" ? "Sign Up Free" : "Sign In"}
                </button>
              </p>
            )}
          </div>

          {/* Benefits strip — customers only */}
          {!isAdmin && (
            <div className="mt-5 rounded-2xl p-5 border border-white/6" style={{ background: "rgba(255,255,255,0.03)" }}>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-3">Why Join?</p>
              <div className="space-y-2.5">
                {[["⭐","Earn loyalty points every visit"],["🎁","Exclusive member promos & rewards"],["🏠","Book our function room online"],["🛒","Order ahead — skip the wait"]].map(([ic,txt]) => (
                  <div key={txt} className="flex items-center gap-2.5 text-xs text-neutral-500"><span>{ic}</span><span>{txt}</span></div>
                ))}
              </div>
            </div>
          )}

          {/* Admin info strip */}
          {isAdmin && (
            <div className="mt-5 rounded-2xl p-5 border border-white/6" style={{ background: "rgba(255,255,255,0.03)" }}>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-3">Admin Access</p>
              <div className="space-y-2.5">
                {[["📋","Live order management"],["🧩","Menu & category editor"],["⭐","Loyalty member records"],["🎪","Room booking management"]].map(([ic,txt]) => (
                  <div key={txt} className="flex items-center gap-2.5 text-xs text-neutral-500"><span>{ic}</span><span>{txt}</span></div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}