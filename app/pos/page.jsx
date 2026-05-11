"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

// ─── 1. MODAL: ADD TO CART (FULL ENGINE) ───
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
    <div className="fixed inset-0 z-[250] bg-slate-900/40 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-500">
      <div className="bg-white w-full max-w-lg rounded-t-[32px] md:rounded-[32px] shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-10">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center">
          <div><h2 className="text-lg font-bold text-slate-800">{item.name}</h2><p className="text-[10px] text-slate-400 font-bold uppercase">Base: ₱{item.price}</p></div>
          <button onClick={onClose} className="text-slate-300 text-2xl p-2">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6 hide-scrollbar">
          {item.variants?.map(g => (
            <div key={g.id} className="space-y-3">
              <div className="flex justify-between font-bold text-[11px] uppercase tracking-wide"><span>{g.name}</span>{g.isRequired && <span className="text-[#FC687D]">Required</span>}</div>
              <div className="grid gap-2">
                {g.options.map(o => {
                  const sel = selections[g.id]?.find(x => x.id === o.id);
                  return (
                    <button key={o.id} onClick={() => toggleOption(g, o)} className={`flex justify-between p-4 rounded-2xl border transition-all ${sel ? "border-[#FC687D] bg-rose-50/50" : "border-slate-100 bg-white"}`}>
                      <span className={`text-sm ${sel ? "font-bold" : ""}`}>{o.name}</span>
                      <span className="text-xs text-slate-400">{Number(o.price) > 0 ? `+₱${o.price}` : "FREE"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase text-slate-500">Special Instructions</label>
            <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Notes for kitchen..." className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm outline-none h-20 resize-none" />
          </div>
        </div>
        <div className="p-6 border-t border-slate-50 bg-white">
          <div className="flex items-center border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50 h-14 mb-4">
            <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-16 h-full text-slate-400 hover:text-[#FC687D]">—</button>
            <div className="flex-1 text-center font-bold text-lg">{quantity}</div>
            <button onClick={() => setQuantity(quantity + 1)} className="w-16 h-full text-slate-400 hover:text-[#FC687D]">＋</button>
          </div>
          <button onClick={() => onAddToCart({ ...item, cartItemId: Date.now(), unitPrice, quantity, variantDetails: Object.values(selections).flat().map(o => o.name).join(", "), instructions })} className="w-full py-4 rounded-2xl font-bold text-white shadow-lg active:scale-95 transition-all" style={{ backgroundColor: "#FC687D" }}>
            Add to Ticket • ₱{(unitPrice * quantity).toFixed(0)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 2. MODAL: OPEN TICKETS (RECALL) ───
function OpenTicketsModal({ onClose, onRecall }) {
  const [tickets, setTickets] = useState([]);
  useEffect(() => {
    supabase.from("open_tickets").select("*").order("created_at", { ascending: false }).then(({ data }) => data && setTickets(data));
  }, []);
  return (
    <div className="fixed inset-0 z-[250] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-[28px] shadow-2xl flex flex-col max-h-[70vh]">
        <div className="p-5 border-b border-slate-50 flex justify-between items-center">
          <h2 className="font-bold text-slate-800 uppercase text-xs tracking-widest">Parked Tickets</h2>
          <button onClick={onClose} className="text-slate-300 text-xl">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {tickets.length === 0 ? <p className="text-center py-10 text-xs text-slate-400">No parked orders</p> : 
            tickets.map(t => (
              <button key={t.id} onClick={() => onRecall(t)} className="w-full bg-slate-50/50 hover:bg-rose-50 border border-slate-100 p-4 rounded-2xl text-left transition-all flex justify-between items-center group">
                <div><p className="text-sm font-bold text-slate-800">{t.ticket_name}</p><p className="text-[10px] text-slate-400 mt-0.5">₱{Number(t.total_amount).toFixed(0)}</p></div>
                <span className="text-[#FC687D] text-[10px] font-bold opacity-0 group-hover:opacity-100">RECALL →</span>
              </button>
            ))
          }
        </div>
      </div>
    </div>
  );
}

// ─── 3. MAIN TERMINAL PAGE ───
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
      if (!session) window.location.href = "https://admin.jujabrewandbites.com/login";
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
    if (dRes.data) { setDiningOptions(dRes.data); setOrderType(dRes.data.find(o => o.is_default)?.name || dRes.data[0]?.name || ""); }
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

  const handleRecallTicket = (ticket) => {
    setCart(ticket.items); setOrderType(ticket.order_type); 
    if (ticket.customer_id) setAttachedCustomer(customers.find(c => c.id === ticket.customer_id));
    setIsOpenTicketsModalOpen(false);
  };

  const handleSaveTicket = async () => {
    if (cart.length === 0) return;
    const name = prompt("Enter Ticket Name:", attachedCustomer?.name || "Quick Order");
    if (!name) return;
    await supabase.from("open_tickets").insert([{ ticket_name: name, customer_id: attachedCustomer?.id, order_type: orderType, items: cart, total_amount: subtotal }]);
    setCart([]); setAttachedCustomer(null); alert("Ticket Parked!");
  };

  const subtotal = cart.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);

  if (loading) return <div className="h-screen flex items-center justify-center bg-white"><div className="w-6 h-6 border-2 border-slate-100 border-t-[#FC687D] animate-spin rounded-full"></div></div>;

  return (
    <div className="flex h-screen bg-[#FDFDFD] font-sans overflow-hidden text-slate-800">
      
      {/* LEFT: MENU TERMINAL */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <header className="p-4 md:p-6 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 className="text-lg font-bold tracking-tight">Juja Terminal</h1>
            <div className="flex gap-2">
               <select value={activeCategory} onChange={(e) => setActiveCategory(e.target.value)} className="bg-slate-50 px-3 py-2 rounded-xl font-bold text-[10px] text-slate-600 border border-slate-100 outline-none uppercase">
                 <option value="ALL">All Categories</option>
                 {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
               </select>
               <div className="relative group">
                 <input type="text" placeholder="Search..." value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} className="w-32 md:w-56 px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none focus:bg-white" />
                 <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-20 text-[10px]">🔍</span>
               </div>
            </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-max hide-scrollbar animate-in fade-in duration-500 pb-24 lg:pb-6">
          {items.filter(i => (activeCategory === "ALL" || i.category === activeCategory) && i.name.toLowerCase().includes(menuSearch.toLowerCase())).map((i) => (
            <button key={i.id} onClick={() => setSelectedItemForModal(i)} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-4 transition-all duration-300 hover:shadow-lg hover:border-rose-100 text-left group">
              <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center overflow-hidden flex-shrink-0">{i.image_url ? <img src={i.image_url} className="w-full h-full object-cover" /> : "☕"}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[8px] font-bold text-[#FC687D] mb-0.5 uppercase">{i.category}</p>
                <h3 className="font-bold text-slate-800 text-xs truncate">{i.name}</h3>
                <p className="text-[11px] font-bold text-slate-400 mt-0.5">₱{Number(i.price).toFixed(0)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* MOBILE FLOATING CART BAR */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-6 left-6 right-6 z-[200]">
          <button onClick={() => setMobileCartOpen(true)} className="w-full bg-slate-900 text-white flex items-center justify-between px-6 py-4 rounded-2xl shadow-2xl active:scale-[0.98]">
            <span className="text-sm font-bold">View Ticket ({cart.length})</span>
            <span className="text-sm font-bold tracking-tight">₱{subtotal.toFixed(0)}</span>
          </button>
        </div>
      )}

      {/* RIGHT: TICKET SIDEBAR (AND MOBILE DRAWER) */}
      <div className={`${mobileCartOpen ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'} fixed lg:relative bottom-0 left-0 right-0 h-[85vh] lg:h-full lg:w-[360px] bg-white border-l border-slate-100 flex flex-col z-[300] transition-transform duration-500 rounded-t-[40px] lg:rounded-none shadow-2xl lg:shadow-none`}>
        <div className="p-6 border-b border-slate-50">
           <div className="lg:hidden w-10 h-1.5 bg-slate-100 rounded-full mx-auto mb-6" onClick={() => setMobileCartOpen(false)} />
           <div className="flex justify-between items-center mb-6">
             <h2 className="text-xs font-bold text-slate-800 uppercase tracking-widest">{attachedCustomer ? attachedCustomer.name : "New Ticket"}</h2>
             <div className="flex gap-2">
               <button onClick={handleSaveTicket} className="w-9 h-9 flex items-center justify-center bg-slate-50 border border-slate-100 rounded-xl hover:bg-emerald-50 text-xs shadow-sm">📥</button>
               <button onClick={() => setIsOpenTicketsModalOpen(true)} className="w-9 h-9 flex items-center justify-center bg-slate-50 border border-slate-100 rounded-xl hover:bg-rose-50 text-xs shadow-sm">📋</button>
             </div>
           </div>
           
           <div className="space-y-3">
             <form onSubmit={handleScanSubmit} className="flex gap-2">
                <button type="button" onClick={() => document.getElementById('scan-in').focus()} className="text-slate-300 font-bold text-xs hover:text-[#FC687D]">|||</button>
                <input id="scan-in" type="text" placeholder="Scan loyalty or item..." value={customerSearch} onFocus={() => setIsCustListOpen(true)} onChange={(e) => setCustomerSearch(e.target.value)} className="flex-1 p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none" />
             </form>
             
             {isCustListOpen && customerSearch.length > 0 && (
               <div className="absolute top-[150px] left-6 right-6 bg-white border border-slate-100 rounded-2xl shadow-2xl z-50 max-h-40 overflow-y-auto divide-y divide-slate-50">
                  {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).map(c => (
                    <button key={c.id} onClick={() => { setAttachedCustomer(c); setIsCustListOpen(false); setCustomerSearch(""); }} className="w-full text-left p-3 hover:bg-rose-50 text-xs font-bold">{c.name}</button>
                  ))}
               </div>
             )}

             <select value={orderType} onChange={(e) => setOrderType(e.target.value)} className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 outline-none">
                {diningOptions.map(opt => <option key={opt.id} value={opt.name}>{opt.name}</option>)}
             </select>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 hide-scrollbar">
           {cart.length === 0 ? (
             <div className="h-full flex items-center justify-center opacity-20 text-[10px] font-bold uppercase tracking-widest">Cart Empty</div>
           ) : (
             cart.map((item, idx) => (
               <div key={item.cartItemId} className="flex justify-between items-start group border-b border-slate-50 pb-3">
                  <div className="flex-1 pr-4">
                    <p className="font-bold text-[13px] text-slate-800">{item.name} <span className="text-[#FC687D]">x{item.quantity}</span></p>
                    {item.variantDetails && <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">{item.variantDetails}</p>}
                    {item.instructions && <p className="text-[10px] text-amber-600 font-bold mt-1 italic">"{item.instructions}"</p>}
                    <button onClick={() => { const n = [...cart]; n.splice(idx,1); setCart(n); }} className="text-[9px] text-slate-300 group-hover:text-red-400 transition-colors uppercase font-bold mt-1">Remove</button>
                  </div>
                  <p className="font-bold text-[13px] text-slate-800">₱{item.unitPrice * item.quantity}</p>
               </div>
             ))
           )}
        </div>

        <div className="p-6 border-t border-slate-50 bg-white">
           <div className="flex justify-between items-end mb-4">
              <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Subtotal</p>
              <p className="text-3xl font-bold text-slate-900 leading-none tracking-tighter">₱{subtotal.toFixed(0)}</p>
           </div>
           <button disabled={cart.length === 0} className="w-full py-4 bg-[#FC687D] text-white rounded-2xl font-bold text-sm shadow-xl active:scale-[0.98] disabled:opacity-30">Charge Order</button>
        </div>
      </div>

      {/* MODALS */}
      {selectedItemForModal && <AddToCartModal item={selectedItemForModal} onClose={() => setSelectedItemForModal(null)} onAddToCart={(d) => { setCart([...cart, d]); setSelectedItemForModal(null); setMobileCartOpen(true); }} />}
      {isOpenTicketsModalOpen && <OpenTicketsModal onClose={() => setIsOpenTicketsModalOpen(false)} onRecall={handleRecallTicket} />}
    </div>
  );
}