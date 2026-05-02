"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { MenuItem } from "../api/entities";

export default function Home() {
  const [featured, setFeatured] = useState([]);

  useEffect(() => {
    // This now hits your live Supabase database!
    MenuItem.filter({ is_featured: true }).then(setFeatured).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-brand-light text-brand-dark font-sans">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur border-b border-brand-gray">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-brand-teal tracking-wide">
            Juja Brew & Bites
          </Link>
          <div className="hidden md:flex gap-8 text-brand-dark text-sm font-medium">
            <Link href="/" className="hover:text-brand-teal transition">Home</Link>
            <Link href="/menu" className="hover:text-brand-teal transition">Menu</Link>
            <Link href="/about" className="hover:text-brand-teal transition">About Us</Link>
            <Link href="/order" className="hover:text-brand-teal transition">Order Online</Link>
          </div>
          <div className="flex gap-3">
            <Link href="/login" className="text-sm px-4 py-2 rounded border border-brand-gray text-brand-dark hover:border-brand-teal hover:text-brand-teal transition">
              Login
            </Link>
            <Link href="/order" className="text-sm px-4 py-2 rounded bg-brand-teal text-white font-semibold hover:bg-teal-600 transition shadow-sm">
              Order Now
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center text-center px-6"
        style={{background: "linear-gradient(to bottom, rgba(255,255,255,0.7) 0%, rgba(249,250,251,0.9) 100%), url('https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1600&q=80') center/cover no-repeat"}}>
        <div className="max-w-3xl mt-20">
          <p className="text-brand-teal uppercase tracking-widest text-sm mb-4 font-bold">Modern Cafe Experience</p>
          <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-6 text-brand-dark">
            Coffee, Comfort & <br />
            <span className="text-brand-teal">Dubai Chewy Cookies</span>
          </h1>
          <p className="text-gray-600 text-lg md:text-xl mb-10 max-w-xl mx-auto">
            Experience the finest local brews and our signature baked goods, right here in Pasong Tamo, Quezon City.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/order" className="px-8 py-4 bg-brand-teal text-white font-bold rounded shadow-md hover:bg-teal-600 transition text-lg">
              Order Online
            </Link>
            <Link href="/menu" className="px-8 py-4 border-2 border-brand-dark text-brand-dark rounded hover:border-brand-teal hover:text-brand-teal transition text-lg font-bold">
              View Menu
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-10 text-center">
          {[
            { icon: "☕", title: "Signature Brews", desc: "Expertly roasted and brewed exactly how you like it." },
            { icon: "🍪", title: "Freshly Baked", desc: "Home of the famous Dubai chewy cookie, baked fresh daily." },
            { icon: "🛵", title: "Quick Delivery", desc: "Hot coffee and warm pastries delivered straight to your door." },
          ].map((f) => (
            <div key={f.title} className="p-8 rounded-md bg-brand-light border border-brand-gray shadow-sm">
              <div className="text-5xl mb-4">{f.icon}</div>
              <h3 className="text-xl font-bold text-brand-dark mb-2">{f.title}</h3>
              <p className="text-gray-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured Dishes */}
      {featured.length > 0 && (
        <section className="py-20 px-6 bg-brand-light">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-brand-teal uppercase tracking-widest text-sm mb-2 font-bold">Handpicked for You</p>
              <h2 className="text-4xl font-bold text-brand-dark">Featured Items</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {featured.slice(0, 3).map((item) => (
                <div key={item.id} className="bg-white rounded-md overflow-hidden border border-brand-gray hover:border-brand-teal transition shadow-sm group">
                  <div className="h-48 bg-brand-gray flex items-center justify-center text-6xl">
                    {/* Once you upload real images to Supabase, you can swap this emoji for an <img src={item.image_url} /> tag! */}
                    {item.category === "Coffee" ? "☕" : item.category === "Pastries" ? "🥐" : "🍽"}
                  </div>
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-lg text-brand-dark">{item.name}</h3>
                      <span className="text-brand-teal font-bold">₱{item.price?.toFixed(2)}</span>
                    </div>
                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">{item.description}</p>
                    <Link href="/order" className="block text-center py-2 px-4 rounded bg-brand-light text-brand-teal border border-brand-teal/30 hover:bg-brand-teal hover:text-white transition text-sm font-medium">
                      Order This
                    </Link>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center mt-10">
              <Link href="/menu" className="inline-block px-8 py-3 border border-brand-teal text-brand-teal rounded hover:bg-brand-teal hover:text-white transition font-medium">
                View Full Menu
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-20 px-6 bg-brand-teal text-white text-center">
        <h2 className="text-4xl font-bold mb-4">Craving Something Sweet?</h2>
        <p className="text-teal-50 text-lg mb-8 max-w-xl mx-auto">Get our famous Dubai chewy cookies and your favorite coffee delivered or ready for pickup.</p>
        <Link href="/order" className="inline-block px-10 py-4 bg-white text-brand-teal rounded font-bold text-lg hover:bg-brand-light shadow-md transition">
          Start Your Order
        </Link>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-brand-gray py-10 px-6 text-center text-gray-500 text-sm">
        <div className="text-brand-teal text-xl font-bold mb-2">Juja Brew & Bites</div>
        <p>Visayas Ave., Pasong Tamo, Quezon City • hello@jujabrew.ph</p>
        <p className="mt-2">© {new Date().getFullYear()} Juja Brew & Bites. All rights reserved.</p>
      </footer>
    </div>
  );
}