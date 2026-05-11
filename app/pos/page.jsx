"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

// ─── 1. MODAL: ADD TO CART (REFINED) ───
function AddToCartModal({ item, onClose, onAddToCart }) {
  const [quantity, setQuantity] = useState(1);
  const brandColor = "#FC687D";

  return (
    <div className="fixed inset-0 z-[250] bg-slate-900/40 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-500">
      <div className="bg-white w-full max-w-md rounded-t-[28px] md:rounded-[28px] overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom-10 zoom-in-95 duration-300">
        <div className="px-6 py-5 border-b border-slate-50 flex justify-between items-center bg-white">
          <h2 className="text-lg font-semibold text-slate-800">{item.name}</h2>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-600 text-xl p-2">✕</button>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50 h-14">
            <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-16 h-full flex items-center justify-center text-slate-400 hover:text-[#FC687D] transition-all">—</button>
            <div className="flex-1 text-center font-semibold text-lg text-slate-800">{quantity}</div>
            <button onClick={() => setQuantity(quantity + 1)} className="w-16 h-full flex items-center justify-center text-slate-400 hover:text-[#FC687D] transition-all">＋</button>
          </div>
          <button 
            onClick={() => onAddToCart({ ...item, cartItemId: Date.now(), unitPrice: Number(item.price), quantity })} 
            className="w-full py-4 rounded-xl font-semibold text-white shadow-lg transition-all active:scale-[0.98]" 
            style={{ backgroundColor: brandColor }}
          >
            Add to ticket • ₱{(Number(item.price) * quantity).toFixed(0)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 2. MODAL: OPEN TICKETS (RECALL) ───
function OpenTicketsModal({ onClose, onRecall }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTickets = async () => {
      const { data } = await supabase.from("open_tickets").select("*").order("created_at", { ascending: false });
      if (data) setTickets(data);
      setLoading(false);
    };
    fetchTickets();
  }, []);

  return (
    <div className="fixed inset-0 z-[250] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-[28px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[70vh]">
        <div className="px-6 py-5 border-b border-slate-50 flex justify-between items-center">
          <h2 className="text-base font-semibold text-slate-800">Open Tickets</h2>
          <button onClick={onClose} className="text-slate-300 text-xl font-light">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 hide-scrollbar">
          {loading ? (
            <p className="text-center py-10 text-xs text-slate-400">Syncing...</p>
          ) : tickets.length === 0 ? (
            <p className="text-center py-10 text-xs text-slate-400">No parked orders</p>
          ) : (
            tickets.map((t) => (
              <button key={t.id} onClick={() => onRecall(t)} className="w-full bg-slate-50/50 hover:bg-rose-50/30 border border-slate-100 p-4 rounded-xl text-left transition-all flex justify-between items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{t.ticket_name}</p>
                  <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">₱{Number(t.total_amount).toFixed(0)}</p>
                </div>
                <span className="text-[#FC687D] text-xs font-semibold">Recall →</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 3. MAIN TERMINAL PAGE ───
export default function POSPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]); 
  const [diningOptions, setDiningOptions] = useState([]); 
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isOpenTicketsModalOpen, setIsOpenTicketsModalOpen] = useState(false);
  const [activeTicketId, setActiveTicketId] = useState(null); 
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [menuSearch, setMenuSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustListOpen, setIsCustListOpen] = useState(false);
  const [attachedCustomer, setAttachedCustomer] = useState(null);
  const [selectedItemForModal, setSelectedItemForModal] = useState(null);
  const [orderType, setOrderType] = useState("");

  const searchRef = useRef(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = "https://admin.jujabrewandbites.com/login"; return; }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!["admin", "cashier", "super_admin"].includes(profile?.role)) { window.location.href = "https://jujabrewandbites.com"; return; }
      fetchData();
    };
    checkAuth();

    const close = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setIsCustListOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
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

  const handleRecallTicket = (ticket) => {
    setCart(ticket.items); setOrderType(ticket.order_type); setActiveTicketId(ticket.id);
    if (ticket.customer_id) setAttachedCustomer(customers.find(c => c.id === ticket.customer_id));
    setIsOpenTicketsModalOpen(false);
  };

  const subtotal = cart.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);

  if (loading) return <div className="h-screen flex items-center justify-center bg-white"><div className="w-6 h-6 border-2 border-slate-100 border-t-[#FC687D] animate-spin rounded-full"></div></div>;

  return (
    <div className="flex h-screen bg-[#FDFDFD] font-sans overflow-hidden text-slate-800">
      
      {/* LEFT: MENU TERMINAL */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <header className="p-5 md:p-6 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 className="text-xl font-bold tracking-tight">Juja Terminal</h1>
            
            <div className="flex gap-2">
               <select value={activeCategory} onChange={(e) => setActiveCategory(e.target.value)} className="bg-slate-50 px-3 py-2 rounded-lg font-semibold text-[11px] text-slate-600 outline-none border border-slate-100 transition-all appearance-none">
                 <option value="ALL">All Categories</option>
                 {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
               </select>
               <div className="relative group">
                 <input type="text" placeholder="Search..." value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} className="w-40 md:w-56 pl-8 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none" />
                 <span className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-20 text-xs">🔍</span>
               </div>
            </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 md:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-max hide-scrollbar animate-in fade-in duration-500 pb-32 md:pb-6">
          {items.filter(i => (activeCategory === "ALL" || i.category === activeCategory) && i.name.toLowerCase().includes(menuSearch.toLowerCase())).map((i, idx) => (
            <button key={i.id} onClick={() => setSelectedItemForModal(i)} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-4 transition-all duration-300 group h-[100px] hover:shadow-lg hover:border-rose-100" style={{ animationDelay: `${idx * 30}ms` }}>
              <div className="w-14 h-14 rounded-xl bg-rose-50 flex items-center justify-center text-xl flex-shrink-0 overflow-hidden">{i.image_url ? <img src={i.image_url} className="w-full h-full object-cover" /> : "☕"}</div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-[9px] font-semibold text-[#FC687D] mb-0.5 uppercase tracking-wider">{i.category}</p>
                <h3 className="font-semibold text-slate-800 text-sm truncate">{i.name}</h3>
                <p className="text-sm font-medium text-slate-500">₱{Number(i.price).toFixed(0)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* MOBILE BAR */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-6 left-6 right-6 z-[200]">
          <button className="w-full bg-slate-900 text-white flex items-center justify-between px-6 py-4 rounded-2xl shadow-2xl active:scale-[0.98]">
            <span className="text-sm font-semibold">View Ticket ({cart.length})</span>
            <span className="text-sm font-bold">₱{subtotal.toFixed(0)}</span>
          </button>
        </div>
      )}

      {/* RIGHT: TICKET SIDEBAR */}
      <div className="hidden lg:flex w-[350px] bg-white border-l border-slate-100 flex-col relative z-10">
        <div className="p-6 border-b border-slate-50">
           <div className="flex justify-between items-center mb-6">
             <h2 className="text-base font-bold text-slate-800">{attachedCustomer ? attachedCustomer.name : "New Ticket"}</h2>
             <button onClick={() => setIsOpenTicketsModalOpen(true)} className="w-10 h-10 flex items-center justify-center bg-slate-50 border border-slate-100 rounded-xl hover:bg-rose-50 transition-all active:scale-90">📋</button>
           </div>
           
           <div className="space-y-3" ref={searchRef}>
             <form onSubmit={handleScanSubmit} className="flex gap-2">
                <button type="button" onClick={() => document.getElementById('scan-in').focus()} className="text-slate-300 font-bold text-xs hover:text-[#FC687D]">|||</button>
                <input id="scan-in" type="text" placeholder="Scan loyalty or item..." value={customerSearch} onFocus={() => setIsCustListOpen(true)} onChange={(e) => setCustomerSearch(e.target.value)} className="flex-1 p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none focus:bg-white" />
             </form>
             
             {isCustListOpen && customerSearch.length > 0 && (
               <div className="absolute top-[140px] left-6 right-6 bg-white border border-slate-100 rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-50">
                  {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).map(c => (
                    <button key={c.id} onClick={() => { setAttachedCustomer(c); setIsCustListOpen(false); setCustomerSearch(""); }} className="w-full text-left p-3 hover:bg-rose-50 text-xs font-semibold">{c.name}</button>
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
             <div className="h-full flex items-center justify-center opacity-20 text-xs font-bold uppercase tracking-widest">Empty Ticket</div>
           ) : (
             cart.map((item, idx) => (
               <div key={item.cartItemId} className="flex justify-between items-start group">
                  <div className="flex-1 pr-4">
                    <p className="font-semibold text-[13px] text-slate-800">{item.name} <span className="text-[#FC687D]">x{item.quantity}</span></p>
                    <button onClick={() => { const n = [...cart]; n.splice(idx,1); setCart(n); }} className="text-[9px] text-slate-300 group-hover:text-red-400 transition-colors uppercase font-bold">Remove</button>
                  </div>
                  <p className="font-bold text-[13px] text-slate-800">₱{item.unitPrice * item.quantity}</p>
               </div>
             ))
           )}
        </div>

        <div className="p-6 border-t border-slate-50">
           <div className="flex justify-between items-end mb-4">
              <p className="text-[9px] font-bold text-slate-300 uppercase tracking-[0.2em]">Payable Amount</p>
              <p className="text-2xl font-bold text-slate-900 leading-none">₱{subtotal.toFixed(0)}</p>
           </div>
           <button disabled={cart.length === 0} className="w-full py-4 bg-[#FC687D] text-white rounded-xl font-bold text-sm shadow-lg shadow-rose-100 transition-all active:scale-[0.98] disabled:opacity-30">
             Charge Order
           </button>
        </div>
      </div>

      {/* MODALS */}
      {selectedItemForModal && <AddToCartModal item={selectedItemForModal} onClose={() => setSelectedItemForModal(null)} onAddToCart={(d) => { setCart([...cart, d]); setSelectedItemForModal(null); }} />}
      {isOpenTicketsModalOpen && <OpenTicketsModal onClose={() => setIsOpenTicketsModalOpen(false)} onRecall={handleRecallTicket} />}
    </div>
  );
}