"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

// ─── 1. MODAL: ADD TO CART (READABLE VERSION) ───
function AddToCartModal({ item, onClose, onAddToCart }) {
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState({});
  const [instructions, setInstructions] = useState("");

  useEffect(() => {
    if (item.variants) {
      const defaults = {};
      item.variants.forEach(g => {
        if (g.isRequired && g.options.length > 0) defaults[g.id] = [g.options[0]];
      });
      setSelections(defaults);
    }
  }, [item]);

  const toggleOption = (group, opt) => {
    const current = selections[group.id] || [];
    if (!group.isMultiSelect) {
      setSelections({ ...selections, [group.id]: [opt] });
    } else {
      const exists = current.find(o => o.id === opt.id);
      setSelections({ ...selections, [group.id]: exists ? current.filter(o => o.id !== opt.id) : [...current, opt] });
    }
  };

  const unitPrice = (Number(item.price) || 0) + Object.values(selections).flat().reduce((sum, o) => sum + (Number(o.price) || 0), 0);

  return (
    <div className="fixed inset-0 z-[250] bg-slate-900/40 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center">
          <div>
            <h2 className="text-xl text-slate-800">{item.name}</h2>
            <p className="text-sm text-slate-500">Base: ₱{item.price}</p>
          </div>
          <button onClick={onClose} className="text-slate-300 text-3xl p-2">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {item.variants?.map(g => (
            <div key={g.id} className="space-y-4">
              <div className="flex justify-between text-sm text-slate-500">
                <span>{g.name}</span>
                {g.isRequired && <span className="text-rose-500">Required</span>}
              </div>
              <div className="grid gap-3">
                {g.options.map(o => {
                  const sel = selections[g.id]?.find(x => x.id === o.id);
                  return (
                    <button key={o.id} onClick={() => toggleOption(g, o)} className={`flex justify-between p-5 rounded-2xl border transition-all ${sel ? "border-rose-400 bg-rose-50/50" : "border-slate-100 bg-white"}`}>
                      <span className={sel ? "text-slate-800" : "text-slate-600"}>{o.name}</span>
                      <span className="text-slate-400">{Number(o.price) > 0 ? `+₱${o.price}` : "Free"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="space-y-3">
            <label className="text-sm text-slate-500">Special Instructions</label>
            <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Add notes for the kitchen..." className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-base outline-none h-24 resize-none" />
          </div>
        </div>
        <div className="p-6 border-t border-slate-50 bg-white">
          <div className="flex items-center border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50 h-16 mb-4">
            <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-20 h-full text-2xl text-slate-400 hover:text-rose-500 transition-colors">&minus;</button>
            <div className="flex-1 text-center text-xl text-slate-800">{quantity}</div>
            <button onClick={() => setQuantity(quantity + 1)} className="w-20 h-full text-2xl text-slate-400 hover:text-rose-500 transition-colors">&#43;</button>
          </div>
          <button onClick={() => onAddToCart({ ...item, cartItemId: Date.now(), unitPrice, quantity, variantDetails: Object.values(selections).flat().map(o => o.name).join(", "), instructions })} className="w-full py-5 rounded-2xl text-white text-lg transition-all active:scale-[0.98]" style={{ backgroundColor: "#FC687D" }}>
            Add to Ticket · ₱{(unitPrice * quantity).toFixed(0)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 2. MAIN TERMINAL PAGE ───
export default function POSPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]); 
  const [diningOptions, setDiningOptions] = useState([]); 
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [menuSearch, setMenuSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustListOpen, setIsCustListOpen] = useState(false);
  const [attachedCustomer, setAttachedCustomer] = useState(null);
  const [selectedItemForModal, setSelectedItemForModal] = useState(null);
  const [isOpenTicketsModalOpen, setIsOpenTicketsModalOpen] = useState(false);
  const [orderType, setOrderType] = useState("");
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) window.location.href = "/login";
      else fetchData();
    });
  }, []);

  async function fetchData() {
    setLoading(true);
    const [iRes, cRes, catRes, dRes] = await Promise.all([
      supabase.from("menu_items").select("*").eq("is_available", true).order("name"),
      supabase.from("loyalty_members").select('id, name:"Customer name", code:"Customer code"'),
      supabase.from("menu_categories").select("*").order("sort_order"),
      supabase.from("dining_options").select("*").eq("is_available", true).order("sort_order")
    ]);
    if (iRes.data) setItems(iRes.data);
    if (cRes.data) setCustomers(cRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (dRes.data) { 
        setDiningOptions(dRes.data); 
        setOrderType(dRes.data.find(o => o.is_default)?.name || dRes.data[0]?.name || ""); 
    }
    setLoading(false);
  }

  const handleScanSubmit = (e) => {
    e.preventDefault();
    const q = customerSearch.trim().toLowerCase();
    const matchItem = items.find(i => i.sku?.toLowerCase() === q || i.name.toLowerCase() === q);
    if (matchItem) { setSelectedItemForModal(matchItem); setCustomerSearch(""); return; }
    const matchCust = customers.find(c => c.code?.toLowerCase() === q || c.name?.toLowerCase().includes(q));
    if (matchCust) { setAttachedCustomer(matchCust); setCustomerSearch(""); setIsCustListOpen(false); }
  };

  const subtotal = cart.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);

  if (loading) return <div className="h-screen flex items-center justify-center bg-white"><div className="w-8 h-8 border-2 border-slate-100 border-t-rose-400 animate-spin rounded-full"></div></div>;

  return (
    <div className="flex h-screen bg-[#FDFDFD] overflow-hidden text-slate-800">
      
      {/* LEFT: MENU TERMINAL */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <header className="p-6 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex flex-col">
              <h1 className="text-2xl text-slate-800">Juja Terminal</h1>
              <p className="text-sm text-slate-400">Main Branch</p>
            </div>
            <div className="flex gap-3">
               <select value={activeCategory} onChange={(e) => setActiveCategory(e.target.value)} className="bg-slate-50 px-4 py-3 rounded-2xl text-sm text-slate-600 border border-slate-100 outline-none cursor-pointer">
                 <option value="ALL">All Categories</option>
                 {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
               </select>
               <div className="relative">
                 <input type="text" placeholder="Search menu..." value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} className="w-40 md:w-64 px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm outline-none focus:bg-white" />
               </div>
            </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 auto-rows-max hide-scrollbar pb-32">
          {items.filter(i => (activeCategory === "ALL" || i.category === activeCategory) && i.name.toLowerCase().includes(menuSearch.toLowerCase())).map((i) => (
            <button key={i.id} onClick={() => setSelectedItemForModal(i)} className="bg-white p-5 rounded-3xl border border-slate-100 flex items-center gap-5 transition-all hover:border-rose-200 text-left group">
              <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center overflow-hidden flex-shrink-0 text-3xl">
                {i.image_url ? <img src={i.image_url} className="w-full h-full object-cover" /> : "☕"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-rose-400 mb-1">{i.category}</p>
                <h3 className="text-base text-slate-800 truncate">{i.name}</h3>
                <p className="text-sm text-slate-500 mt-1">₱{Number(i.price).toFixed(0)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* MOBILE BAR */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-6 left-6 right-6 z-[200]">
          <button onClick={() => setMobileCartOpen(true)} className="w-full bg-slate-900 text-white flex items-center justify-between px-6 py-5 rounded-2xl shadow-2xl active:scale-[0.98]">
            <span className="text-base">View Ticket ({cart.length})</span>
            <span className="text-base">₱{subtotal.toFixed(0)}</span>
          </button>
        </div>
      )}

      {/* RIGHT: TICKET SIDEBAR */}
      <div className={`${mobileCartOpen ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'} fixed lg:relative bottom-0 left-0 right-0 h-[85vh] lg:h-full lg:w-[380px] bg-white border-l border-slate-100 flex flex-col z-[300] transition-transform duration-500 rounded-t-[40px] lg:rounded-none shadow-2xl lg:shadow-none`}>
        <div className="p-8 border-b border-slate-50">
           <div className="lg:hidden w-12 h-1.5 bg-slate-100 rounded-full mx-auto mb-8" onClick={() => setMobileCartOpen(false)} />
           <div className="flex justify-between items-center mb-8">
             <h2 className="text-lg text-slate-800">{attachedCustomer ? attachedCustomer.name : "Current Order"}</h2>
             <button onClick={() => setIsOpenTicketsModalOpen(true)} className="w-12 h-12 flex items-center justify-center bg-slate-50 rounded-2xl text-xl">📋</button>
           </div>
           
           <div className="space-y-4">
             <form onSubmit={handleScanSubmit} className="flex gap-2">
                <button type="button" onClick={() => document.getElementById('scan-in').focus()} className="text-slate-300 text-xl hover:text-rose-400">|||</button>
                <input id="scan-in" type="text" placeholder="Scan loyalty or product..." value={customerSearch} onFocus={() => setIsCustListOpen(true)} onChange={(e) => setCustomerSearch(e.target.value)} className="flex-1 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm outline-none" />
             </form>
             
             {isCustListOpen && customerSearch.length > 0 && (
               <div className="absolute top-[160px] left-8 right-8 bg-white border border-slate-100 rounded-3xl shadow-2xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-50">
                  {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).map(c => (
                    <button key={c.id} onClick={() => { setAttachedCustomer(c); setIsCustListOpen(false); setCustomerSearch(""); }} className="w-full text-left p-4 hover:bg-rose-50 text-sm">{c.name}</button>
                  ))}
               </div>
             )}

             <select value={orderType} onChange={(e) => setOrderType(e.target.value)} className="w-full bg-white border border-slate-100 rounded-2xl px-4 py-3 text-sm text-slate-500 outline-none appearance-none">
                {diningOptions.map(opt => <option key={opt.id} value={opt.name}>{opt.name}</option>)}
             </select>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6 hide-scrollbar">
           {cart.length === 0 ? (
             <div className="h-full flex items-center justify-center opacity-30 text-sm">Ticket is empty</div>
           ) : (
             cart.map((item, idx) => (
               <div key={item.cartItemId} className="flex justify-between items-start group border-b border-slate-50 pb-5 last:border-0">
                  <div className="flex-1 pr-6">
                    <p className="text-base text-slate-800">{item.name} <span className="text-rose-400 ml-1">x{item.quantity}</span></p>
                    {item.variantDetails && <p className="text-xs text-slate-400 mt-1">{item.variantDetails}</p>}
                    {item.instructions && <p className="text-xs text-amber-600 mt-2 bg-amber-50 p-2 rounded-lg italic">"{item.instructions}"</p>}
                    <button onClick={() => { const n = [...cart]; n.splice(idx,1); setCart(n); }} className="text-xs text-slate-300 group-hover:text-red-400 transition-colors mt-3 block">Remove Item</button>
                  </div>
                  <p className="text-base text-slate-800">₱{item.unitPrice * item.quantity}</p>
               </div>
             ))
           )}
        </div>

        <div className="p-8 border-t border-slate-50 bg-white">
           <div className="flex justify-between items-end mb-6">
              <p className="text-sm text-slate-400">Total Payable</p>
              <p className="text-4xl text-slate-900">₱{subtotal.toFixed(0)}</p>
           </div>
           <button disabled={cart.length === 0} className="w-full py-5 bg-[#FC687D] text-white rounded-2xl text-lg shadow-xl active:scale-[0.98] disabled:opacity-30">Charge Now</button>
        </div>
      </div>

      {selectedItemForModal && <AddToCartModal item={selectedItemForModal} onClose={() => setSelectedItemForModal(null)} onAddToCart={(d) => { setCart([...cart, d]); setSelectedItemForModal(null); setMobileCartOpen(true); }} />}
    </div>
  );
}