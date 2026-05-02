"use client";

import { useState } from "react";
import Link from "next/link";

export default function Login() {
  const [mode, setMode] = useState("login");

  return (
    <div className="min-h-screen bg-brand-light text-brand-dark flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md bg-white border border-brand-gray p-8 shadow-sm">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2 text-brand-dark">
            {mode === "login" ? "Welcome Back" : "Join Juja"}
          </h1>
          <p className="text-gray-500">Sign in to manage your cookie orders</p>
        </div>

        <div className="flex border border-brand-gray mb-8">
          <button 
            onClick={() => setMode("login")}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest ${mode === 'login' ? 'bg-brand-teal text-white' : 'text-gray-400'}`}
          >
            Login
          </button>
          <button 
            onClick={() => setMode("signup")}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest ${mode === 'signup' ? 'bg-brand-teal text-white' : 'text-gray-400'}`}
          >
            Sign Up
          </button>
        </div>

        <form className="space-y-4">
          {mode === "signup" && (
            <input type="text" placeholder="Full Name" className="w-full border border-brand-gray p-3 text-sm focus:border-brand-teal outline-none" />
          )}
          <input type="email" placeholder="Email Address" className="w-full border border-brand-gray p-3 text-sm focus:border-brand-teal outline-none" />
          <input type="password" placeholder="Password" className="w-full border border-brand-gray p-3 text-sm focus:border-brand-teal outline-none" />
          <button className="w-full py-4 bg-brand-dark text-white font-bold uppercase text-sm tracking-widest hover:bg-brand-teal transition mt-2">
            {mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-brand-gray text-center">
          <Link href="/order" className="text-brand-teal text-sm font-bold hover:underline">
            Order as Guest →
          </Link>
        </div>
      </div>
    </div>
  );
}