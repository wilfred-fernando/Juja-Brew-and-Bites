"use client";

import Link from "next/link";

const STATS = [
  { num: "2026", label: "Launched" },
  { num: "QC", label: "Home Base" },
  { num: "100%", label: "Fresh Daily" },
];

export default function About() {
  return (
    <div className="min-h-screen bg-brand-light text-brand-dark font-sans">
      <nav className="fixed top-0 w-full z-50 bg-white border-b border-brand-gray">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-brand-teal tracking-wide">Juja Brew & Bites</Link>
          <div className="hidden md:flex gap-8 text-brand-dark text-sm font-medium">
            <Link href="/" className="hover:text-brand-teal">Home</Link>
            <Link href="/menu" className="hover:text-brand-teal">Menu</Link>
            <Link href="/about" className="text-brand-teal font-bold">About Us</Link>
            <Link href="/order" className="hover:text-brand-teal">Order Online</Link>
          </div>
        </div>
      </nav>

      <div className="pt-32 pb-16 px-6 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">Our Story</h1>
        <p className="text-gray-600 max-w-2xl mx-auto text-lg">
          Located in Visayas Ave., Quezon City, Juja Brew & Bites is a modern cafe dedicated to quality coffee and artisanal treats.
        </p>
      </div>

      <section className="py-16 px-6 bg-white border-y border-brand-gray">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold mb-6 text-brand-teal">Brewing in Pasong Tamo</h2>
            <p className="text-gray-600 mb-4 leading-relaxed">
              Juja Brew & Bites started with a simple mission: to provide our local community with a modern space to enjoy premium beverages and unique snacks.
            </p>
            <p className="text-gray-600 leading-relaxed">
              We are best known for our <strong>Dubai chewy cookies</strong>, which we launched in April 2026. Every cookie is crafted to be perfectly rich and satisfying.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {STATS.map(s => (
              <div key={s.label} className="bg-brand-light border border-brand-gray p-6 text-center">
                <div className="text-2xl font-bold text-brand-teal mb-1">{s.num}</div>
                <div className="text-gray-500 text-xs uppercase font-bold">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}