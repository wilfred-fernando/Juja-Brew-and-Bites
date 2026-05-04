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

export default function Login() {
  const [portal, setPortal] = useState("customer"); // "customer" | "admin"
  const [mode, setMode] = useState("login");         // "login" | "signup" | "reset"
  const [form, setForm] = useState({ email: "", password: "", full_name: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false); // Tracks if the reset email was sent
  const router = useRouter();

  const switchPortal = (p) => { 
    setPortal(p); 
    setMode("login"); 
    setError(""); 
    setResetSent(false);
    setForm({ email: "", password: "", full_name: "" }); 
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); 
    setLoading(true);

    try {
      // ─── 1. PASSWORD RESET FLOW ───
      if (mode === "reset") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(form.email, {
          redirectTo: `${window.location.origin}/update-password`, // Where to send them after clicking the email link
        });
        if (resetError) throw resetError;
        setResetSent(true);
        setLoading(false);
        return; // Stop here, don't try to log them in or route them yet
      }

      // ─── 2. LOGIN FLOW ───
      if (mode === "login") {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (authError) throw authError;

        // SECURITY CHECK: Block non-admins from the Staff Portal
        if (portal === "admin") {
          const userRole = data.user?.user_metadata?.role;
          if (userRole !== "admin") {
            await supabase.auth.signOut();
            throw new Error("Access Denied: Your account does not have admin privileges.");
          }
        }
      } 
      
      // ─── 3. SIGNUP FLOW ───
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

      // Success! Send them to the right dashboard
      router.push(portal === "admin" ? "/admin" : "/customer");

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
              { id: "admin",    icon: "🔐", label: "Admin / Staff" },
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
            <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.25em] bg-rose-50 text-[#FC687D] border border-rose-100">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FC687D] animate-pulse" />
              {isAdmin ? "Admin Portal" : "Customer Portal"}
            </div>
            
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight mb-2 transition-all">
              {mode === "login" ? "Welcome Back" : mode === "signup" ? "Create Account" : "Reset Password"}
            </h1>
            
            <p className="text-slate-500 text-sm font-medium">
              {mode === "reset" 
                ? "Enter your email to receive a secure reset link."
                : isAdmin
                  ? "Sign in to manage orders & the menu."
                  : mode === "login" 
                    ? "Sign in to your Juja account." 
                    : "Join the Juja loyalty program."}
            </p>
          </div>

          {/* ── MAIN CARD ── */}
          <div className="bg-white rounded-[32px] p-6 md:p-8 shadow-[0_8px_30px_rgba(252,104,125,0.06)] border border-rose-50 relative overflow-hidden">

            {/* If the reset email was sent successfully, show this friendly message */}
            {resetSent ? (
              <div className="text-center py-6 animate-in zoom-in-95 duration-500">
                <div className="w-20 h-20 bg-[#FFF9FA] border border-rose-100 rounded-full flex items-center justify-center text-4xl mx-auto mb-5">
                  💌
                </div>
                <h3 className="text-xl font-extrabold text-slate-800 mb-2">Check your inbox!</h3>
                <p className="text-slate-500 text-[13px] font-medium mb-8">
                  We've sent a password reset link to <br/><span className="text-[#FC687D] font-bold">{form.email}</span>
                </p>
                <button onClick={() => { setMode("login"); setResetSent(false); }}
                  className="w-full py-4 bg-slate-50 border border-slate-200 text-slate-600 rounded-full text-[13px] font-bold uppercase tracking-widest hover:bg-slate-100 transition-all">
                  ← Back to Login
                </button>
              </div>
            ) : (
              // Otherwise, show the form
              <>
                {/* Sign In / Sign Up sub-tabs (Customers only, hidden during reset) */}
                {!isAdmin && mode !== "reset" && (
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

                  {/* Password Field (Hidden during reset mode) */}
                  {mode !== "reset" && (
                    <div>
                      <div className="flex justify-between items-end mb-2 ml-2 mr-3">
                        <label className="block text-[11px] font-bold text-slate-800">Password</label>
                        {mode === "login" && (
                          <button type="button" onClick={() => { setMode("reset"); setError(""); }} 
                            className="text-[10px] font-bold text-[#FC687D] hover:underline underline-offset-2">
                            Forgot?
                          </button>
                        )}
                      </div>
                      <input type="password" required value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-[#FC687D] focus:bg-white focus:ring-1 focus:ring-[#FC687D] transition-all"
                        placeholder="••••••••" />
                    </div>
                  )}

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
                    {loading ? "Please wait..." : mode === "login" ? "Sign In →" : mode === "reset" ? "Send Reset Link →" : "Create Account →"}
                  </button>

                  {/* Cancel Reset Link */}
                  {mode === "reset" && (
                    <p className="text-center mt-4">
                      <button type="button" onClick={() => { setMode("login"); setError(""); }} className="text-[11px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors">
                        Cancel
                      </button>
                    </p>
                  )}
                </form>

                {/* Customer mode — toggle link (Hidden during reset) */}
                {!isAdmin && mode !== "reset" && (
                  <p className="text-center text-slate-500 text-[13px] font-medium mt-6">
                    {mode === "login" ? "Don't have an account? " : "Already a member? "}
                    <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
                      className="text-[#FC687D] font-bold hover:underline underline-offset-4">
                      {mode === "login" ? "Sign Up Free" : "Sign In"}
                    </button>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}