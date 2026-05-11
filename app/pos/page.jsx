"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

// ─── 1. MODAL: ADD TO CART (REFINED) ───
function AddToCartModal({ item, onClose, onAddToCart }) {
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState({});
  const brandColor = "#FC687D";

  const calculateUnitPrice = () => {
    let base = Number(item.price) || 0;
    Object.values(selections).forEach(opt => { base += Number(opt.price || 0); });
    return base;
  };

  const handleSave = () => {
    onAddToCart({ 
      ...item, 
      cartItemId: Date.now(), 
      unitPrice: calculateUnitPrice(), 
      quantity, 
    });
  };

  return (
    <div className="fixed inset-0 z-[250] bg-slate-900/40 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-500">
      <div className="bg-white w-full max-w-md rounded-t-[28px] md:rounded-[28px] overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom-10 zoom-in-95 duration-300">
        <div className="px-6 py-5 border-b border-slate-50 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-800">{item.name}</h2>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-600 text-xl p-2">✕</button>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50 h-14">
            <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-16 h-full flex items-center justify-center text-slate-400 hover:text-[#FC687D] transition-all">—</button>
            <div className="flex-1 text-center font-semibold text-lg text-slate-800">{quantity}</div>
            <button onClick={() => setQuantity(quantity + 1)} className="w-16 h-full flex items-center justify-center text-slate-400 hover:text-[#FC687D] transition-all">＋</button>
          </div>
          <button onClick={handleSave} className="w-full py-4 rounded-xl font-semibold text-white shadow-lg transition-all active:scale-[0.98]" style={{ backgroundColor: brandColor }}>
            Add to ticket • ₱{(calculateUnitPrice() * quantity).toFixed(0)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 2. MENU CARD COMPONENT ───
function MenuCard({ item, onClick, index }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={() => onClick(item)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-4 transition-all duration-300 group h-[100px]"
      style={{
        animationDelay: `${index * 40}ms`,
        transform: isHovered ? "translateY(-4px)" : "translateY(0)",
        boxShadow: isHovered ? "0 12px 24px rgba(252,104,125,0.08)" : "0 1px 2px rgba(0,0,0,0.01)",
      }}
    >
      <div className="w-14 h-14 rounded-xl bg-rose-50 flex items-center justify-center text-xl flex-shrink-0 overflow-hidden border border-rose-50">
        {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover" /> : "☕"}
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className="text-[9px] font-semibold text-[#FC687D] mb-0.5">{item.category}</p>
        <h3 className="font-semibold text-slate-800 text-sm truncate">{item.name}</h3>
        <p className="text-sm font-medium text-slate-500">₱{Number(item.price).toFixed(0)}</p>
      </div>
    </button>
  );
}

// ─── 3. MAIN TERMINAL PAGE ───
export default function POSPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuSearch, setMenuSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [selectedItemForModal, setSelectedItemForModal] = useState(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const [iRes, catRes] = await Promise.all([
        supabase.from("menu_items").select("*").eq("is_available", true).order("name"),
        supabase.from("menu_categories").select("*").order("sort_order")
      ]);
      if (iRes.data) setItems(iRes.data);
      if (catRes.data) setCategories(catRes.data);
      setLoading(false);
    }
    fetchData();
  }, []);

  const subtotal = cart.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);

  if (loading) return <div className="h-screen flex items-center justify-center bg-white"><div className="w-6 h-6 border-2 border-slate-100 border-t-[#FC687D] animate-spin rounded-full"></div></div>;

  return (
    <div className="flex h-screen bg-[#FDFDFD] font-sans overflow-hidden text-slate-800">
      
      {/* LEFT: MENU GRID */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <header className="p-5 md:p-6 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 className="text-xl font-bold tracking-tight text-slate-800">Terminal</h1>
            
            <div className="flex gap-2">
               <select 
                value={activeCategory} 
                onChange={(e) => setActiveCategory(e.target.value)} 
                className="bg-slate-50 px-3 py-2 rounded-lg font-semibold text-[11px] text-slate-600 outline-none border border-slate-100 focus:border-[#FC687D]/20 transition-all appearance-none"
               >
                 <option value="ALL">All Categories</option>
                 {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
               </select>
               
               <div className="relative group">
                 <input 
                  type="text" 
                  placeholder="Search..." 
                  value={menuSearch} 
                  onChange={(e) => setMenuSearch(e.target.value)} 
                  className="w-40 md:w-56 pl-8 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs focus:outline-none focus:bg-white" 
                 />
                 <span className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-20 text-xs">🔍</span>
               </div>
            </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 md:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-max hide-scrollbar animate-in fade-in duration-500 pb-32 md:pb-6">
          {items.filter(i => (activeCategory === "ALL" || i.category === activeCategory) && i.name.toLowerCase().includes(menuSearch.toLowerCase())).map((i, idx) => (
            <MenuCard key={i.id} item={i} index={idx} onClick={setSelectedItemForModal} />
          ))}
        </div>
      </div>

      {/* MOBILE FLOATING CART BAR (Only shows on mobile when cart has items) */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-6 left-6 right-6 z-[200] animate-in slide-in-from-bottom-10">
          <button 
            className="w-full bg-slate-900 text-white flex items-center justify-between px-6 py-4 rounded-2xl shadow-2xl active:scale-[0.98] transition-all"
            onClick={() => {/* Trigger mobile cart overlay if needed */}}
          >
            <div className="flex items-center gap-3">
              <span className="bg-[#FC687D] w-6 h-6 rounded-full text-[10px] flex items-center justify-center font-bold">{cart.length}</span>
              <span className="text-sm font-semibold">View Ticket</span>
            </div>
            <span className="text-sm font-bold">₱{subtotal.toFixed(0)}</span>
          </button>
        </div>
      )}

      {/* RIGHT: TICKET SIDEBAR (DESKTOP ONLY) */}
      <div className="hidden lg:flex w-[340px] bg-white border-l border-slate-100 flex-col relative z-10">
        <div className="p-6 border-b border-slate-50">
           <h2 className="text-base font-bold text-slate-800 mb-4">Current Ticket</h2>
           <div className="flex gap-2">
              <input type="text" placeholder="Loyalty code..." className="flex-1 p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none" />
              <button className="px-4 bg-slate-800 text-white rounded-lg text-[10px] font-bold">SCAN</button>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 hide-scrollbar">
           {cart.length === 0 ? (
             <div className="h-full flex items-center justify-center opacity-20"><p className="text-xs">Cart empty</p></div>
           ) : (
             cart.map((item) => (
               <div key={item.cartItemId} className="flex justify-between items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[13px] text-slate-800 truncate">{item.name} x{item.quantity}</p>
                    <p className="text-[10px] text-slate-400">₱{item.unitPrice}</p>
                  </div>
                  <p className="font-bold text-[13px] text-slate-800">₱{item.unitPrice * item.quantity}</p>
               </div>
             ))
           )}
        </div>

        <div className="p-6 border-t border-slate-50">
           <div className="flex justify-between items-end mb-4">
              <p className="text-[10px] font-semibold text-slate-400">TOTAL</p>
              <p className="text-2xl font-bold text-slate-900 leading-none">₱{subtotal.toFixed(0)}</p>
           </div>
           <button disabled={cart.length === 0} className="w-full py-3.5 bg-[#FC687D] text-white rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98] disabled:opacity-30">
             Charge Order
           </button>
        </div>
      </div>

      {selectedItemForModal && (
        <AddToCartModal 
          item={selectedItemForModal} 
          onClose={() => setSelectedItemForModal(null)} 
          onAddToCart={(d) => { 
            setCart([...cart, d]); 
            setSelectedItemForModal(null); 
          }} 
        />
      )}
    </div>
  );
}