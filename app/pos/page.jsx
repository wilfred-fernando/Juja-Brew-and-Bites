"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

// ==========================================
// FUNCTION: SAVE TICKET MODAL (Custom UI)
// ==========================================
function SaveTicketModal({ onSave, onClose, defaultName }) {
  const [name, setName] = useState(defaultName || "");
  return (
    <div className="fixed inset-0 z-[500] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl">
        <h3 className="text-xl font-semibold mb-2">Save Ticket</h3>
        <input 
          autoFocus 
          className="w-full p-4 bg-slate-50 rounded-2xl mb-8 outline-none border border-slate-100 focus:border-rose-300"
          value={name} 
          onChange={(e) => setName(e.target.value)} 
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-4 bg-slate-100 rounded-2xl">Cancel</button>
          <button onClick={() => onSave(name)} className="flex-[2] py-4 bg-[#FC687D] text-white rounded-2xl shadow-lg">Confirm Save</button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// FUNCTION: ADD TO CART MODAL (Variants & Logic)
// ==========================================
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
    <div className="fixed inset-0 z-[250] bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-md rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="p-5 border-b border-slate-50 flex justify-between items-center">
          <h2 className="text-lg text-slate-800 font-medium">{item.name}</h2>
          <button onClick={onClose} className="text-slate-300 text-2xl px-2 hover:text-rose-500 transition-colors">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-6 hide-scrollbar">
          {item.variants?.map(g => (
            <div key={g.id} className="space-y-3">
              <div className="flex justify-between text-[11px] text-slate-400 uppercase tracking-wider"><span>{g.name}</span>{g.isRequired && <span className="text-rose-400">Required</span>}</div>
              <div className="grid gap-2">
                {g.options.map(o => {
                  const sel = selections[g.id]?.find(x => x.id === o.id);
                  return (
                    <button key={o.id} onClick={() => toggleOption(g, o)} className={`flex justify-between p-4 rounded-xl border text-sm transition-all ${sel ? "border-rose-300 bg-rose-50/30" : "border-slate-100 bg-white"}`}>
                      <span className={sel ? "text-slate-800 font-medium" : "text-slate-500"}>{o.name}</span>
                      <span className="text-xs text-slate-400">{Number(o.price) > 0 ? `+₱${o.price}` : "—"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="space-y-2">
            <label className="text-[11px] text-slate-400 uppercase tracking-wider">Special Instructions</label>
            <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Add specific notes..." className="w-full p-4 bg-slate-50 border-none rounded-xl text-sm outline-none h-20 resize-none focus:bg-slate-100/50 transition-all" />
          </div>
        </div>
        <div className="p-5 border-t border-slate-50">
          <div className="flex items-center border border-slate-100 rounded-xl overflow-hidden h-12 mb-4 bg-slate-50/50">
            <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-16 h-full text-xl text-slate-400 transition-colors hover:text-rose-500">&minus;</button>
            <div className="flex-1 text-center text-slate-800 text-lg font-medium">{quantity}</div>
            <button onClick={() => setQuantity(quantity + 1)} className="w-16 h-full text-xl text-slate-400 transition-colors hover:text-rose-500">&#43;</button>
          </div>
          <button onClick={() => onAddToCart({ ...item, cartItemId: Date.now(), unitPrice, quantity, variantDetails: Object.values(selections).flat().map(o => o.name).join(", "), instructions })} className="w-full py-4 rounded-xl text-white text-sm font-medium shadow-lg transition-all active:scale-[0.98]" style={{ backgroundColor: "#FC687D" }}>
            Add to Ticket · ₱{(unitPrice * quantity).toFixed(0)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// FUNCTION: CUSTOM CONFIRM MODAL (Clear Cart)
// ==========================================
function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[500] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl text-center animate-in zoom-in-95 duration-300">
        <h3 className="text-xl font-semibold text-slate-800 mb-2">{title}</h3>
        <p className="text-sm text-slate-500 mb-8 leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-4 bg-slate-100 rounded-2xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all">Cancel</button>
          <button onClick={onConfirm} className="flex-[2] py-4 rounded-2xl text-sm font-medium text-white transition-all active:scale-95 shadow-lg bg-[#FC687D]">Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// MAIN POS TERMINAL COMPONENT
// ==========================================
export default function POSPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]); 
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [menuSearch, setMenuSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustListOpen, setIsCustListOpen] = useState(false);
  const [attachedCustomer, setAttachedCustomer] = useState(null);
  const [selectedItemForModal, setSelectedItemForModal] = useState(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [orderType, setOrderType] = useState("Dine In");

  // 1. DATA INITIALIZATION & AUTH GATE
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) window.location.href = "https://admin.jujabrewandbites.com/login";
      else fetchData();
    });
  }, []);

  async function fetchData() {
    setLoading(true);
    const [iRes, catRes, cRes] = await Promise.all([
      supabase.from("menu_items").select("*").eq("is_available", true).order("name"),
      supabase.from("menu_categories").select("*").order("sort_order"),
      supabase.from("loyalty_members").select('id, name:"Customer name", code:"Customer code"')
    ]);
    if (iRes.data) setItems(iRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (cRes.data) setCustomers(cRes.data);
    setLoading(false);
  }

  // 2. BARCODE & LOYALTY SCAN LOGIC
  const handleScanSubmit = (e) => {
    e.preventDefault();
    const q = customerSearch.trim().toLowerCase();
    const matchItem = items.find(i => i.sku?.toLowerCase() === q || i.name.toLowerCase() === q);
    if (matchItem) { setSelectedItemForModal(matchItem); setCustomerSearch(""); return; }
    const matchCust = customers.find(c => c.code?.toLowerCase() === q || c.name?.toLowerCase().includes(q));
    if (matchCust) { setAttachedCustomer(matchCust); setCustomerSearch(""); setIsCustListOpen(false); }
  };

  // 3. SAVE TICKET (PARK) LOGIC
 const executeSaveTicket = async (label) => {
  if (!label.trim()) return;
  
  const { error } = await supabase.from("open_tickets").insert([{
    ticket_name: label,
    items: cart,
    total_amount: subtotal,
    order_type: orderType,
    customer_id: attachedCustomer?.id || null
  }]);

  if (!error) {
    setCart([]); // Clear cart after saving
    setAttachedCustomer(null);
    setIsSaveModalOpen(false);
  } else {
    alert("Error saving ticket: " + error.message);
  }
};

  const subtotal = cart.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);

  if (loading) return <div className="h-screen flex items-center justify-center bg-white"><div className="w-6 h-6 border-t-rose-400 animate-spin rounded-full border-2 border-slate-100"></div></div>;

  return (
    <div className="flex h-screen bg-white font-sans overflow-hidden text-slate-800">
      
      {/* --- MENU SECTION --- */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="p-4 border-b border-slate-50 flex items-center justify-between gap-4">
            <h1 className="text-lg font-semibold hidden md:block">Terminal</h1>
            <div className="flex gap-2 flex-1 md:flex-none justify-end">
               <select value={activeCategory} onChange={(e) => setActiveCategory(e.target.value)} className="bg-slate-50 px-3 py-2 rounded-lg text-xs outline-none">
                 <option value="ALL">All Categories</option>
                 {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
               </select>
               <input type="text" placeholder="Search..." value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} className="w-full max-w-[180px] px-3 py-2 bg-slate-50 rounded-lg text-xs outline-none focus:bg-slate-100" />
            </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 auto-rows-max hide-scrollbar pb-24">
          {items.filter(i => (activeCategory === "ALL" || i.category === activeCategory) && i.name.toLowerCase().includes(menuSearch.toLowerCase())).map((i) => (
            <button key={i.id} onClick={() => setSelectedItemForModal(i)} className="bg-white p-3 rounded-2xl border border-slate-100 flex items-center gap-3 hover:border-rose-100 text-left transition-all h-20 group">
              <div className="w-12 h-12 rounded-lg bg-rose-50 flex items-center justify-center overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform">{i.image_url ? <img src={i.image_url} className="w-full h-full object-cover" /> : "☕"}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-rose-400 mb-0.5">{i.category}</p>
                <h3 className="text-sm text-slate-800 truncate font-medium">{i.name}</h3>
                <p className="text-sm text-slate-400">₱{Number(i.price).toFixed(0)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* --- MOBILE CART BAR --- */}
      {cart.length > 0 && !mobileCartOpen && (
        <div className="lg:hidden fixed bottom-4 left-4 right-4 z-[200]">
          <button onClick={() => setMobileCartOpen(true)} className="w-full bg-slate-900 text-white flex items-center justify-between px-5 py-4 rounded-xl shadow-xl active:scale-[0.98]">
            <span className="text-sm font-medium">Ticket ({cart.length})</span>
            <span className="text-sm font-semibold tracking-tight">₱{subtotal.toFixed(0)}</span>
          </button>
        </div>
      )}

      {/* --- TICKET SIDEBAR SECTION --- */}
      <div className={`${mobileCartOpen ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'} fixed lg:relative bottom-0 left-0 right-0 h-[90vh] lg:h-full lg:w-[340px] bg-white border-l border-slate-100 flex flex-col z-[300] transition-transform duration-300 rounded-t-3xl lg:rounded-none shadow-2xl lg:shadow-none`}>
        <div className="p-4 border-b border-slate-50 flex-shrink-0">
           <div className="lg:hidden w-10 h-1 bg-slate-100 rounded-full mx-auto mb-4" onClick={() => setMobileCartOpen(false)} />
           <div className="flex justify-between items-center mb-4">
             <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{attachedCustomer ? attachedCustomer.name : "New Ticket"}</h2>
             <div className="flex gap-2">
               <button onClick={() => setConfirmClear(true)} className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-rose-500 text-xl transition-colors">✕</button>
               <button onClick={handleSaveTicket} className="w-8 h-8 flex items-center justify-center bg-slate-50 rounded-lg text-sm hover:bg-slate-100 transition-colors">📥</button>
               <button className="w-8 h-8 flex items-center justify-center bg-slate-50 rounded-lg text-sm hover:bg-slate-100 transition-colors">📋</button>
             </div>
           </div>
           
           <div className="space-y-2">
             <form onSubmit={handleScanSubmit} className="flex gap-2">
                <button type="button" onClick={() => document.getElementById('scan-in').focus()} className="text-slate-300 font-bold text-sm hover:text-rose-400">|||</button>
                <input id="scan-in" type="text" placeholder="Scan loyalty..." value={customerSearch} onFocus={() => setIsCustListOpen(true)} onChange={(e) => setCustomerSearch(e.target.value)} className="flex-1 px-3 py-2 bg-slate-50 border-none rounded-lg text-sm outline-none" />
             </form>
             {isCustListOpen && customerSearch.length > 0 && (
               <div className="absolute top-[135px] left-4 right-4 bg-white border border-slate-100 rounded-xl shadow-2xl z-50 max-h-40 overflow-y-auto divide-y divide-slate-50">
                  {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).map(c => (
                    <button key={c.id} onClick={() => { setAttachedCustomer(c); setIsCustListOpen(false); setCustomerSearch(""); }} className="w-full text-left p-3 hover:bg-rose-50 text-xs font-medium">{c.name}</button>
                  ))}
               </div>
             )}
             <select value={orderType} onChange={(e) => setOrderType(e.target.value)} className="w-full bg-slate-50 rounded-lg px-3 py-2 text-[11px] font-medium text-slate-500 outline-none cursor-pointer">
                <option>Dine In</option><option>Take Out</option><option>Delivery</option>
             </select>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar">
           {cart.length === 0 ? (
             <div className="h-full flex items-center justify-center opacity-10 text-[10px] uppercase font-semibold">Empty Ticket</div>
           ) : (
             cart.map((item, idx) => (
               <div key={item.cartItemId} className="flex justify-between items-start border-b border-slate-50 pb-2">
                  <div className="flex-1 pr-3">
                    <p className="text-sm text-slate-800 leading-tight font-medium">{item.name} <span className="text-rose-400">x{item.quantity}</span></p>
                    {item.variantDetails && <p className="text-[10px] text-slate-400 mt-0.5">{item.variantDetails}</p>}
                    <button onClick={() => { const n = [...cart]; n.splice(idx,1); setCart(n); }} className="text-[10px] text-slate-300 hover:text-red-500 mt-1 transition-colors underline">Remove</button>
                  </div>
                  <p className="text-sm text-slate-800 font-medium">₱{item.unitPrice * item.quantity}</p>
               </div>
             ))
           )}
        </div>

        <div className="p-4 border-t border-slate-50 bg-white flex-shrink-0">
           <div className="flex justify-between items-end mb-4 px-1">
              <p className="text-[11px] text-slate-400 font-medium uppercase tracking-tight">Payable</p>
              <p className="text-2xl font-semibold text-slate-900">₱{subtotal.toFixed(0)}</p>
           </div>
           <button disabled={cart.length === 0} className="w-full py-4 bg-slate-900 text-white rounded-xl text-sm font-medium shadow-xl active:scale-[0.98] disabled:opacity-30 transition-all">Charge Order</button>
        </div>
      </div>

      {/* --- MODAL CONTROLLERS --- */}
      {selectedItemForModal && <AddToCartModal item={selectedItemForModal} onClose={() => setSelectedItemForModal(null)} onAddToCart={(d) => { setCart([...cart, d]); setSelectedItemForModal(null); setMobileCartOpen(true); }} />}
      {confirmClear && <ConfirmModal title="Empty Ticket?" message="This will remove all items currently added to this ticket." onConfirm={() => { setCart([]); setAttachedCustomer(null); setConfirmClear(false); }} onCancel={() => setConfirmClear(false)} />}
    </div>
  );
}