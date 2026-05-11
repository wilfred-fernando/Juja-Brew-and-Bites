"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

// ─── 1. MODAL: ADD TO CART (CLEAN VERSION) ───
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
    const variantText = Object.values(selections).map(s => s.name).join(", ");
    onAddToCart({ 
      ...item, 
      cartItemId: Date.now(), 
      unitPrice: calculateUnitPrice(), 
      quantity, 
      variantDetails: variantText 
    });
  };

  return (
    <div className="fixed inset-0 z-[250] bg-slate-900/40 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-500">
      <div className="bg-white w-full max-w-md rounded-t-[32px] md:rounded-[32px] overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom-10 zoom-in-95 duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]">
        <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center bg-white">
          <h2 className="text-xl font-semibold text-slate-800">{item.name}</h2>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-600 text-2xl font-light p-2">✕</button>
        </div>
        <div className="p-8 space-y-8">
          <div>
            <label className="text-xs font-medium mb-3 block text-slate-500">Quantity</label>
            <div className="flex items-center border border-slate-100 rounded-[20px] overflow-hidden bg-slate-50/50 shadow-inner h-16">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-20 h-full flex items-center justify-center text-slate-400 hover:bg-white hover:text-[#FC687D] transition-all text-lg">—</button>
              <div className="flex-1 text-center font-semibold text-xl text-slate-800">{quantity}</div>
              <button onClick={() => setQuantity(quantity + 1)} className="w-20 h-full flex items-center justify-center text-slate-400 hover:bg-white hover:text-[#FC687D] transition-all text-lg">＋</button>
            </div>
          </div>
          <button 
            onClick={handleSave} 
            className="w-full py-5 rounded-[20px] font-semibold text-white text-lg shadow-xl shadow-rose-100 transition-all active:scale-[0.95] hover:brightness-105" 
            style={{ backgroundColor: brandColor }}
          >
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
      className="bg-white p-5 rounded-[28px] border border-slate-100 flex items-center gap-5 transition-all duration-350 group relative overflow-hidden h-[110px]"
      style={{
        animationDelay: `${index * 50}ms`,
        transitionTimingFunction: "cubic-bezier(0.25,0.46,0.45,0.94)",
        transform: isHovered ? "translateY(-6px)" : "translateY(0)",
        boxShadow: isHovered ? "0 15px 30px rgba(252,104,125,0.1)" : "0 2px 8px rgba(0,0,0,0.01)",
      }}
    >
      <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center text-2xl transition-transform duration-500 group-hover:scale-110 flex-shrink-0">
        {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover rounded-2xl" /> : "🍵"}
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className="text-[10px] font-semibold text-[#FC687D] mb-0.5">{item.category}</p>
        <h3 className="font-semibold text-slate-800 text-base truncate">{item.name}</h3>
        <p className="text-sm font-medium text-slate-600 mt-0.5">₱{Number(item.price).toFixed(0)}</p>
      </div>
      <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity">
         <span className="bg-[#FC687D] text-white w-7 h-7 rounded-full flex items-center justify-center text-xs">＋</span>
      </div>
    </button>
  );
}

// ─── 3. MAIN TERMINAL PAGE ───
export default function POSPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [successMessage, setSuccessMessage] = useState("");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [menuSearch, setMenuSearch] = useState("");
  const [selectedItemForModal, setSelectedItemForModal] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = "https://admin.jujabrewandbites.com/login"; 
        return;
      }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (profile?.role !== 'admin' && profile?.role !== 'cashier' && profile?.role !== 'super_admin') {
        window.location.href = "https://jujabrewandbites.com";
        return;
      }
      fetchData();
    };
    checkAuth();
  }, []);

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

  const subtotal = cart.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);

  if (loading) return <div className="h-screen flex items-center justify-center bg-white"><div className="w-6 h-6 border-2 border-slate-100 border-t-[#FC687D] animate-spin rounded-full"></div></div>;

  return (
    <div className="flex h-screen bg-[#FDFDFD] font-sans overflow-hidden text-slate-800">
      
      {/* LEFT: MENU GRID */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <header className="p-6 md:p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col">
               <h1 className="text-2xl font-bold tracking-tight text-slate-800">Juja Terminal</h1>
               <p className="text-[11px] font-medium text-slate-400 mt-0.5">Pasong Tamo Branch</p>
            </div>
            
            <div className="flex gap-3">
               <select 
                value={activeCategory} 
                onChange={(e) => setActiveCategory(e.target.value)} 
                className="bg-slate-50 px-4 py-2.5 rounded-xl font-semibold text-xs text-slate-600 outline-none border border-slate-100 focus:border-[#FC687D]/20 transition-all"
               >
                 <option value="ALL">All Categories</option>
                 {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
               </select>
               
               <div className="relative w-full md:w-64 group">
                 <input 
                  type="text" 
                  placeholder="Search products..." 
                  value={menuSearch} 
                  onChange={(e) => setMenuSearch(e.target.value)} 
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs focus:outline-none focus:bg-white focus:border-[#FC687D]/20 transition-all" 
                 />
                 <span className="absolute left-3.5 top-1/2 -translate-y-1/2 opacity-30 text-sm">🔍</span>
               </div>
            </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 auto-rows-max hide-scrollbar animate-in fade-in duration-700">
          {items.filter(i => (activeCategory === "ALL" || i.category === activeCategory) && i.name.toLowerCase().includes(menuSearch.toLowerCase())).map((i, idx) => (
            <MenuCard 
              key={i.id} 
              item={i} 
              index={idx} 
              onClick={setSelectedItemForModal} 
            />
          ))}
        </div>
      </div>

      {/* RIGHT: TICKET SIDEBAR */}
      <div className="hidden lg:flex w-[380px] bg-white border-l border-slate-100 flex-col relative z-10 shadow-sm">
        <div className="p-8 border-b border-slate-50">
           <h2 className="text-lg font-bold text-slate-800 mb-6">Current Ticket</h2>
           <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Find customer..." 
                className="flex-1 p-3.5 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none focus:border-[#FC687D]/20 transition-all"
              />
              <button className="px-5 bg-slate-800 text-white rounded-xl text-xs font-semibold active:scale-95 transition-all">Scan</button>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5 hide-scrollbar">
           {cart.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center opacity-30">
                <span className="text-5xl mb-3">🛒</span>
                <p className="font-medium text-xs">Ticket is empty</p>
             </div>
           ) : (
             cart.map((item) => (
               <div key={item.cartItemId} className="flex justify-between items-center animate-in slide-in-from-right-4 duration-300">
                  <div className="flex flex-col">
                    <p className="font-semibold text-sm text-slate-800">{item.name} <span className="text-[#FC687D] ml-1">x{item.quantity}</span></p>
                    <p className="text-[10px] text-slate-400 font-medium tracking-wide">₱{item.unitPrice}</p>
                  </div>
                  <p className="font-bold text-sm text-slate-800">₱{item.unitPrice * item.quantity}</p>
               </div>
             ))
           )}
        </div>

        <div className="p-8 border-t border-slate-50 space-y-4">
           <div className="flex justify-between items-end mb-2">
              <p className="text-xs font-semibold text-slate-400">Total Amount</p>
              <p className="text-3xl font-bold text-slate-900">₱{subtotal.toFixed(0)}</p>
           </div>
           <button 
            disabled={cart.length === 0}
            className="w-full py-4.5 bg-[#FC687D] text-white rounded-[18px] font-bold text-lg shadow-lg shadow-rose-100 active:scale-[0.98] transition-all disabled:opacity-30 py-4"
           >
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
            setSuccessMessage(`${d.name} added`); 
          }} 
        />
      )}
      {successMessage && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[400] bg-slate-900 text-white px-6 py-3 rounded-full font-semibold text-sm shadow-2xl animate-in fade-in slide-in-from-bottom-5">✓ {successMessage}</div>}
    </div>
  );
}