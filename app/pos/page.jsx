"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

// ─── 1. MODAL: ADD TO CART (FULL FEATURE VERSION) ───
function AddToCartModal({ item, onClose, onAddToCart }) {
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState({});
  const [instructions, setInstructions] = useState("");
  const brandColor = "#FC687D";

  // Initialize defaults for required groups
  useEffect(() => {
    if (item.variants) {
      const defaults = {};
      item.variants.forEach(group => {
        if (group.isRequired && group.options.length > 0) {
          defaults[group.id] = [group.options[0]];
        }
      });
      setSelections(defaults);
    }
  }, [item]);

  const toggleOption = (group, option) => {
    const current = selections[group.id] || [];
    if (!group.isMultiSelect) {
      setSelections({ ...selections, [group.id]: [option] });
    } else {
      const exists = current.find(o => o.id === option.id);
      const updated = exists 
        ? current.filter(o => o.id !== option.id) 
        : [...current, option];
      setSelections({ ...selections, [group.id]: updated });
    }
  };

  const calculateUnitPrice = () => {
    let total = Number(item.price) || 0;
    Object.values(selections).flat().forEach(opt => {
      total += Number(opt.price || 0);
    });
    return total;
  };

  const handleAddToCart = () => {
    const variantText = Object.values(selections)
      .flat()
      .map(o => o.name)
      .join(", ");

    onAddToCart({
      ...item,
      cartItemId: Date.now(),
      unitPrice: calculateUnitPrice(),
      quantity,
      variantDetails: variantText,
      instructions: instructions
    });
  };

  return (
    <div className="fixed inset-0 z-[250] bg-slate-900/40 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-500">
      <div className="bg-white w-full max-w-lg rounded-t-[32px] md:rounded-[32px] overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom-10 duration-300 max-h-[90vh]">
        
        <div className="px-6 py-5 border-b border-slate-50 flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{item.name}</h2>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Base: ₱{item.price}</p>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-600 text-xl p-2">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 hide-scrollbar">
          {/* Render Groups (Variants/Add-ons) */}
          {item.variants?.map((group) => (
            <div key={group.id} className="space-y-3">
              <div className="flex justify-between items-end">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">{group.name}</h3>
                {group.isRequired && <span className="text-[9px] font-bold text-[#FC687D] uppercase">Required</span>}
              </div>
              <div className="grid grid-cols-1 gap-2">
                {group.options.map((opt) => {
                  const isSelected = selections[group.id]?.find(o => o.id === opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggleOption(group, opt)}
                      className={`flex justify-between items-center p-4 rounded-2xl border transition-all text-left ${
                        isSelected 
                          ? "border-[#FC687D] bg-rose-50/50 shadow-sm" 
                          : "border-slate-100 bg-white hover:border-slate-200"
                      }`}
                    >
                      <span className={`text-sm ${isSelected ? "font-bold text-slate-800" : "font-medium text-slate-600"}`}>
                        {opt.name}
                      </span>
                      <span className="text-xs font-bold text-slate-400">
                        {Number(opt.price) > 0 ? `+ ₱${opt.price}` : "FREE"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Special Instructions */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Special Instructions</h3>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="E.g. No sugar, extra hot, less ice..."
              className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm outline-none focus:bg-white focus:border-[#FC687D]/20 transition-all resize-none h-24"
            />
          </div>
        </div>

        {/* Footer: Quantity & Add */}
        <div className="p-6 border-t border-slate-50 space-y-4 bg-white flex-shrink-0">
          <div className="flex items-center border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50 h-14">
            <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-20 h-full flex items-center justify-center text-slate-400 hover:text-[#FC687D] transition-all">—</button>
            <div className="flex-1 text-center font-bold text-lg text-slate-800">{quantity}</div>
            <button onClick={() => setQuantity(quantity + 1)} className="w-20 h-full flex items-center justify-center text-slate-400 hover:text-[#FC687D] transition-all">＋</button>
          </div>
          <button 
            onClick={handleAddToCart}
            className="w-full py-4 rounded-2xl font-bold text-white shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2" 
            style={{ backgroundColor: brandColor }}
          >
            <span>Add to ticket</span>
            <span className="opacity-30">•</span>
            <span>₱{(calculateUnitPrice() * quantity).toFixed(0)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 2. MAIN TERMINAL PAGE ───
export default function POSPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuSearch, setMenuSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [selectedItemForModal, setSelectedItemForModal] = useState(null);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = "https://admin.jujabrewandbites.com/login"; return; }
      
      setLoading(true);
      const [iRes, catRes] = await Promise.all([
        supabase.from("menu_items").select("*").eq("is_available", true).order("name"),
        supabase.from("menu_categories").select("*").order("sort_order")
      ]);
      if (iRes.data) setItems(iRes.data);
      if (catRes.data) setCategories(catRes.data);
      setLoading(false);
    }
    init();
  }, []);

  const subtotal = cart.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);

  if (loading) return <div className="h-screen flex items-center justify-center bg-white"><div className="w-6 h-6 border-2 border-slate-100 border-t-[#FC687D] animate-spin rounded-full"></div></div>;

  return (
    <div className="flex h-screen bg-[#FDFDFD] font-sans overflow-hidden text-slate-800">
      
      {/* LEFT: MENU GRID */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <header className="p-5 md:p-6 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 className="text-xl font-bold tracking-tight text-slate-800">Juja Terminal</h1>
            <div className="flex gap-2">
               <select value={activeCategory} onChange={(e) => setActiveCategory(e.target.value)} className="bg-slate-50 px-3 py-2 rounded-lg font-semibold text-[11px] text-slate-600 border border-slate-100 outline-none">
                 <option value="ALL">All Categories</option>
                 {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
               </select>
               <input type="text" placeholder="Search..." value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} className="w-40 md:w-56 px-4 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none" />
            </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 md:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-max hide-scrollbar animate-in fade-in duration-500">
          {items.filter(i => (activeCategory === "ALL" || i.category === activeCategory) && i.name.toLowerCase().includes(menuSearch.toLowerCase())).map((i) => (
            <button key={i.id} onClick={() => setSelectedItemForModal(i)} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-4 transition-all duration-300 hover:shadow-lg hover:border-rose-100 h-[100px] text-left">
              <div className="w-14 h-14 rounded-xl bg-rose-50 flex items-center justify-center text-xl flex-shrink-0 overflow-hidden border border-rose-50">
                {i.image_url ? <img src={i.image_url} className="w-full h-full object-cover" /> : "☕"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-bold text-[#FC687D] mb-0.5 uppercase">{i.category}</p>
                <h3 className="font-bold text-slate-800 text-sm truncate">{i.name}</h3>
                <p className="text-sm font-semibold text-slate-500">₱{Number(i.price).toFixed(0)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT: TICKET SIDEBAR */}
      <div className="hidden lg:flex w-[350px] bg-white border-l border-slate-100 flex-col relative z-10 shadow-sm">
        <div className="p-6 border-b border-slate-50">
           <h2 className="text-base font-bold text-slate-800 mb-4 tracking-tight">Active Ticket</h2>
           <div className="flex gap-2">
              <input type="text" placeholder="Loyalty code..." className="flex-1 p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none" />
              <button className="px-4 bg-slate-800 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider">Scan</button>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 hide-scrollbar">
           {cart.length === 0 ? (
             <div className="h-full flex items-center justify-center opacity-20 font-bold uppercase tracking-widest text-[10px]">Empty</div>
           ) : (
             cart.map((item, idx) => (
               <div key={item.cartItemId} className="flex justify-between items-start group">
                  <div className="flex-1 pr-4">
                    <p className="font-bold text-[13px] text-slate-800">{item.name} <span className="text-[#FC687D] ml-1">x{item.quantity}</span></p>
                    {item.variantDetails && <p className="text-[10px] text-slate-400 font-medium">{item.variantDetails}</p>}
                    {item.instructions && <p className="text-[10px] text-amber-600 font-bold mt-1 italic">"{item.instructions}"</p>}
                    <button onClick={() => { const n = [...cart]; n.splice(idx,1); setCart(n); }} className="text-[9px] text-slate-300 group-hover:text-red-400 transition-colors uppercase font-bold mt-1">Remove</button>
                  </div>
                  <p className="font-bold text-[13px] text-slate-800">₱{item.unitPrice * item.quantity}</p>
               </div>
             ))
           )}
        </div>

        <div className="p-6 border-t border-slate-50">
           <div className="flex justify-between items-end mb-4">
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">TOTAL</p>
              <p className="text-2xl font-bold text-slate-900 leading-none">₱{subtotal.toFixed(0)}</p>
           </div>
           <button disabled={cart.length === 0} className="w-full py-4 bg-[#FC687D] text-white rounded-xl font-bold text-sm shadow-lg shadow-rose-100 active:scale-[0.98] transition-all disabled:opacity-30">
             Charge Order
           </button>
        </div>
      </div>

      {selectedItemForModal && (
        <AddToCartModal 
          item={selectedItemForModal} 
          onClose={() => setSelectedItemForModal(null)} 
          onAddToCart={(d) => { setCart([...cart, d]); setSelectedItemForModal(null); }} 
        />
      )}
    </div>
  );
}