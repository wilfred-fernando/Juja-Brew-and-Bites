"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { MenuItem, MenuCategory } from "@/api/entities";

export default function FullMenu() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // This pulls your saved data from the Supabase tables we created
    Promise.all([
      MenuItem.list(),
      MenuCategory.list()
    ]).then(([menuData, catData]) => {
      setItems(menuData);
      setCategories(catData.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-brand-light text-brand-dark">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white border-b border-brand-gray">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-brand-teal tracking-wide">
            Juja Brew & Bites
          </Link>
          <div className="flex gap-4">
            <Link href="/order" className="text-sm px-4 py-2 bg-brand-teal text-white font-bold rounded-none hover:bg-teal-600 transition">
              Order Now
            </Link>
          </div>
        </div>
      </nav>

      {/* Menu Header */}
      <div className="pt-32 pb-12 px-6 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">Our Menu</h1>
        <p className="text-gray-500 max-w-xl mx-auto">
          From our signature Dubai chewy cookies to expertly crafted brews.
        </p>
      </div>

      {/* Category Filter */}
      <div className="sticky top-[73px] z-40 bg-white/80 backdrop-blur border-y border-brand-gray px-6 overflow-x-auto">
        <div className="max-w-6xl mx-auto flex justify-center py-4 gap-4 min-w-max">
          <button 
            onClick={() => setActiveCategory("All")}
            className={`px-6 py-2 text-xs font-bold uppercase tracking-widest border transition ${activeCategory === 'All' ? 'bg-brand-dark text-white border-brand-dark' : 'bg-transparent text-gray-400 border-transparent hover:text-brand-dark'}`}
          >
            All
          </button>
          {categories.map(cat => (
            <button 
              key={cat.id}
              onClick={() => setActiveCategory(cat.name)}
              className={`px-6 py-2 text-xs font-bold uppercase tracking-widest border transition ${activeCategory === cat.name ? 'bg-brand-teal text-white border-brand-teal' : 'bg-transparent text-gray-400 border-transparent hover:text-brand-teal'}`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Grid */}
      <main className="max-w-6xl mx-auto px-6 py-16">
        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading the latest bakes...</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-x-12 gap-y-16">
            {items
              .filter(item => activeCategory === "All" || item.category === activeCategory)
              .map(item => (
                <div key={item.id} className="flex gap-6 group">
                  {/* Item Image Placeholder */}
                  <div className="w-24 h-24 bg-brand-gray flex-shrink-0 flex items-center justify-center text-4xl border border-brand-gray group-hover:border-brand-teal transition">
                    {item.category === "Coffee" ? "☕" : "🍪"}
                  </div>
                  
                  <div className="flex-grow border-b border-brand-gray pb-6">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-xl font-bold uppercase tracking-tight">{item.name}</h3>
                      <span className="text-brand-teal font-bold text-lg">₱{item.price.toFixed(2)}</span>
                    </div>
                    <p className="text-gray-500 text-sm leading-relaxed mb-4">{item.description}</p>
                    {item.is_featured && (
                      <span className="text-[10px] bg-brand-teal/10 text-brand-teal px-2 py-1 font-bold uppercase tracking-tighter">
                        Best Seller
                      </span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </main>

      {/* Call to Action */}
      <section className="bg-brand-dark py-16 text-center text-white px-6">
        <h2 className="text-2xl font-bold mb-6 italic">Ready to taste the difference?</h2>
        <Link href="/order" className="inline-block px-10 py-4 bg-brand-teal text-white font-bold uppercase text-sm tracking-widest hover:bg-white hover:text-brand-teal transition">
          Order Online Now
        </Link>
      </section>
    </div>
  );
}