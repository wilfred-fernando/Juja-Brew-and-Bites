"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

// ─── 1. MODAL: ADD TO CART ───
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
    <div className="fixed inset-0 z-[250] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-[40px] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
        <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center bg-white">
          <h2 className="text-xl font-semibold text-slate-800">{item.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl font-light">✕</button>
        </div>
        <div className="p-8 space-y-8">
          <div>
            <label className="text-sm font-medium mb-2 block text-[#FC687D]">Quantity</label>
            <div className="flex items-center border border-slate-100 rounded-[20px] overflow-hidden bg-white shadow-sm h-14">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-16 h-full flex items-center justify-center text-slate-500 hover:bg-slate-50 border-r border-slate-50 transition-colors">—</button>
              <div className="flex-1 text-center font-semibold text-lg text-slate-800 flex items-center justify-center">{quantity}</div>
              <button onClick={() => setQuantity(quantity + 1)} className="w-16 h-full flex items-center justify-center text-slate-500 hover:bg-slate-50 border-l border-slate-50">＋</button>
            </div>
          </div>
          <button onClick={handleSave} className="w-full py-4 rounded-[24px] font-semibold text-white text-lg shadow-lg shadow-rose-100 transition-all active:scale-[0.98]" style={{ backgroundColor: brandColor }}>
            Add to ticket • ₱{(calculateUnitPrice() * quantity).toFixed(0)}
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
    <div className="fixed inset-0 z-[250] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
        <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-800">Open Tickets</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl font-light">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 hide-scrollbar">
          {loading ? (
            <p className="text-center py-10 text-sm font-medium text-slate-400">Loading...</p>
          ) : tickets.length === 0 ? (
            <p className="text-center py-10 text-sm font-medium text-slate-400">No parked orders</p>
          ) : (
            tickets.map((t) => (
              <button key={t.id} onClick={() => onRecall(t)} className="w-full bg-slate-50/50 hover:bg-[#FDF7F8] border border-slate-50 hover:border-[#FC687D]/20 p-5 rounded-[24px] text-left transition-all group flex justify-between items-center">
                <div>
                  <p className="text-base font-semibold text-slate-800">{t.ticket_name}</p>
                  <p className="text-sm font-medium text-slate-500 mt-1">
                    {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ₱{Number(t.total_amount).toFixed(0)}
                  </p>
                </div>
                <span className="opacity-0 group-hover:opacity-100 text-[#FC687D] text-sm font-medium transition-all">Recall ➔</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 3. MODAL: SUCCESS CONFIRMATION ───
function SuccessModal({ message, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 2000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 pointer-events-none">
      <div className="bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300 flex items-center gap-3">
        <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-xs">✓</div>
        <p className="text-sm font-medium">{message}</p>
      </div>
    </div>
  );
}

// ─── 4. MODAL: SAVE TICKET ───
function SaveTicketModal({ onSave, onClose, autoName }) {
  const [name, setName] = useState(autoName || "");
  return (
    <div className="fixed inset-0 z-[250] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
        <h2 className="text-lg font-semibold text-slate-800 mb-2 text-center">Save Ticket</h2>
        <p className="text-sm text-slate-500 text-center mb-6">Confirm or enter a custom label</p>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} className="w-full border-b-2 border-slate-100 py-3 text-base focus:outline-none focus:border-[#FC687D] font-medium mb-8 transition-all text-center bg-transparent" />
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-3 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
          <button type="button" onClick={() => onSave(name)} className="flex-[2] py-3 bg-[#FC687D] text-white text-sm font-medium rounded-2xl shadow-lg shadow-rose-100 active:scale-95 transition-all">Confirm Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── 5. MAIN TERMINAL PAGE ───
export default function POSPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]); 
  const [diningOptions, setDiningOptions] = useState([]); 
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isOpenTicketsModalOpen, setIsOpenTicketsModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
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
    fetchData();
    const close = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setIsCustListOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [iRes, cRes, catRes, dRes] = await Promise.all([
        supabase.from("menu_items").select("*").eq("is_available", true).order("name"),
        supabase.from("loyalty_members").select('id, name:"Customer name", code:"Customer code", points:"Points balance"'),
        supabase.from("menu_categories").select("*").order("sort_order"),
        supabase.from("dining_options").select("*").eq("is_available", true).order("sort_order", { ascending: true })
      ]);
      if (iRes.data) setItems(iRes.data);
      if (cRes.data) setCustomers(cRes.data);
      if (catRes.data) setCategories(catRes.data);
      if (dRes.data) {
        setDiningOptions(dRes.data);
        const def = dRes.data.find(o => o.is_default);
        setOrderType(def ? def.name : (dRes.data[0]?.name || ""));
      }
    } finally {
      setLoading(false);
    }
  }

  const handleScanSubmit = (e) => {
    e.preventDefault(); 
    const query = customerSearch.trim().toLowerCase();
    if (!query) return;

    const matchedItem = items.find(i => 
      i.sku?.toLowerCase() === query || 
      i.barcode?.toLowerCase() === query || 
      i.name.toLowerCase() === query
    );
    
    if (matchedItem) {
      setSelectedItemForModal(matchedItem);
      setCustomerSearch("");
      setIsCustListOpen(false);
      return;
    }

    const matchedCust = customers.find(c => 
      c.code?.toLowerCase() === query || 
      c.name?.toLowerCase().includes(query)
    );

    if (matchedCust) {
      setAttachedCustomer(matchedCust);
      setCustomerSearch("");
      setIsCustListOpen(false);
    }
  };

  const filteredCustomers = customers.filter(c => {
    const s = customerSearch.toLowerCase();
    return (c.name?.toLowerCase().includes(s)) || (c.code?.includes(s));
  });

  const handleSaveTicket = async (ticketName) => {
    if (cart.length === 0) return;
    const ticketData = {
      ticket_name: ticketName,
      customer_id: attachedCustomer?.id || null,
      order_type: orderType,
      items: cart,
      total_amount: subtotal
    };
    
    if (activeTicketId) ticketData.id = activeTicketId;

    const { error } = await supabase.from("open_tickets").upsert([ticketData]);
    if (!error) {
      setCart([]);
      setAttachedCustomer(null);
      setActiveTicketId(null);
      setCustomerSearch("");
      setIsSaveModalOpen(false);
      setSuccessMessage(activeTicketId ? "Ticket updated" : "Ticket saved");
    }
  };

  const handleRecallTicket = (ticket) => {
    setCart(ticket.items);
    setOrderType(ticket.order_type);
    setActiveTicketId(ticket.id); 
    if (ticket.customer_id) {
       const cust = customers.find(c => c.id === ticket.customer_id);
       setAttachedCustomer(cust);
    }
    setIsOpenTicketsModalOpen(false);
    setSuccessMessage(`Ticket recalled: ${ticket.ticket_name}`);
  };

  const handleClearTicket = () => {
    if (cart.length === 0) return;
    if (confirm("Clear current cart?")) {
      setCart([]);
      setAttachedCustomer(null);
      setActiveTicketId(null);
      setCustomerSearch("");
    }
  };

  const subtotal = cart.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);

  if (loading) return <div className="h-screen flex items-center justify-center bg-white"><div className="w-6 h-6 border-2 border-slate-100 border-t-[#FC687D] animate-spin rounded-full"></div></div>;

  return (
    <div className="flex h-screen bg-[#FDFDFD] font-sans overflow-hidden text-slate-800">
      
      {/* LEFT: MENU GRID */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <header className="p-6 border-b border-slate-50 flex items-center justify-between">
            <select value={activeCategory} onChange={(e) => setActiveCategory(e.target.value)} className="appearance-none bg-transparent font-medium text-sm text-slate-700 outline-none pr-4 cursor-pointer">
              <option value="ALL">All Categories</option>
              {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
            </select>
            <div className="relative w-64">
              <input type="text" placeholder="Search menu..." value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} className="w-full pl-4 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-lg text-sm focus:outline-none focus:bg-white focus:border-[#FC687D]/20 transition-all" />
            </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-max hide-scrollbar">
          {items.filter(i => (activeCategory === "ALL" || i.category === activeCategory) && i.name.toLowerCase().includes(menuSearch.toLowerCase())).map(i => (
            <button key={i.id} onClick={() => setSelectedItemForModal(i)} className="bg-white p-4 rounded-xl border border-slate-100 flex items-center gap-4 hover:border-slate-300 transition-all active:scale-[0.98] h-[90px]">
              <div className="flex-1 text-left min-w-0">
                <h3 className="font-semibold text-base truncate">{i.name}</h3>
                <p className="text-xs font-medium text-slate-500 mt-0.5">{i.category}</p>
              </div>
              <div className="text-right flex-shrink-0 font-semibold text-base">₱{Number(i.price).toFixed(0)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT: TICKET SIDEBAR */}
      <div className="w-[360px] bg-white border-l border-slate-100 flex flex-col relative z-10 shadow-[0_0_40px_rgba(0,0,0,0.02)]">
        <div className="p-6 border-b border-slate-50">
          <div className="flex justify-between items-center mb-6">
            <div className="flex flex-col">
              {activeTicketId && <span className="text-xs font-medium text-[#FC687D] mb-1">Editing Ticket</span>}
              <h2 className="text-lg font-semibold leading-tight">{attachedCustomer ? attachedCustomer.name : (orderType || 'New Ticket')}</h2>
            </div>
            <button type="button" onClick={() => setIsOpenTicketsModalOpen(true)} className="w-10 h-10 flex items-center justify-center bg-slate-50 border border-slate-100 rounded-xl text-slate-500 hover:text-[#FC687D] hover:bg-rose-50 transition-all active:scale-95 shadow-sm">📋</button>
          </div>
          
          <div className="space-y-3" ref={searchRef}>
             <form onSubmit={handleScanSubmit} className={`flex items-center gap-3 px-3 py-2 bg-slate-50 border rounded-lg transition-all ${isCustListOpen ? 'border-blue-300 bg-white shadow-sm' : 'border-slate-100'}`}>
               <button 
                 type="button" 
                 onClick={() => document.getElementById('barcode-scanner-input').focus()} 
                 className="text-slate-400 text-sm font-bold mt-[-2px] hover:text-[#FC687D] transition-colors focus:outline-none"
                 title="Focus Scanner"
               >
                 |||
               </button>
               <input 
                  id="barcode-scanner-input"
                  type="text" 
                  placeholder="Scan loyalty or item..." 
                  value={customerSearch} 
                  onFocus={() => setIsCustListOpen(true)} 
                  onChange={(e) => { setCustomerSearch(e.target.value); setIsCustListOpen(true); }} 
                  className="flex-1 text-sm font-medium text-slate-700 focus:outline-none bg-transparent" 
               />
               <button type="submit" className="hidden">Submit</button>
             </form>
             
             {isCustListOpen && customerSearch.length > 0 && (
               <div className="absolute top-[140px] left-6 right-6 bg-white border border-slate-100 rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-50">
                 {filteredCustomers.length === 0 ? (
                   <p className="p-4 text-center text-sm font-medium text-slate-400">No customer found</p>
                 ) : (
                   filteredCustomers.map(c => (
                     <button type="button" key={c.id} onClick={() => { setAttachedCustomer(c); setIsCustListOpen(false); setCustomerSearch(""); }} className="w-full text-left p-4 hover:bg-blue-50 text-sm font-medium text-slate-700 transition-colors">{c.name}</button>
                   ))
                 )}
               </div>
             )}

             <div className="flex gap-2 relative">
                <select value={orderType} onChange={(e) => setOrderType(e.target.value)} className="flex-1 bg-white border border-slate-100 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 appearance-none cursor-pointer outline-none focus:border-[#FC687D]/30 transition-colors">
                  {diningOptions.map(opt => <option key={opt.id} value={opt.name}>{opt.name}</option>)}
                </select>
                <span className="absolute right-14 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-slate-400">▼</span>
                <button type="button" onClick={handleClearTicket} disabled={cart.length === 0} className="px-4 py-2 border border-slate-100 rounded-lg text-slate-400 disabled:opacity-30 hover:text-red-500 hover:bg-red-50 transition-all">✕</button>
             </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar">
          {cart.map((item, idx) => (
            <div key={item.cartItemId} className="flex flex-col gap-1 border-b border-slate-50 pb-4 last:border-0">
               <div className="flex justify-between items-start">
                 <div className="flex-1 pr-2">
                   <p className="text-sm font-semibold text-slate-800">{item.name} <span className="text-slate-500 ml-1 font-medium">x{item.quantity}</span></p>
                   {item.variantDetails && <p className="text-xs text-slate-500 font-medium mt-0.5">{item.variantDetails}</p>}
                   {item.comment && <p className="text-xs font-medium text-amber-600 mt-1 px-1.5 py-0.5 rounded bg-amber-50 inline-block">Note: {item.comment}</p>}
                 </div>
                 <div className="flex flex-col items-end">
                   <p className="text-sm font-semibold flex-shrink-0">₱{(item.unitPrice * item.quantity).toFixed(0)}</p>
                   <button type="button" onClick={() => { let nc=[...cart]; nc.splice(idx,1); setCart(nc); if(nc.length===0) setActiveTicketId(null); }} className="text-xs font-medium text-red-400 hover:text-red-600 mt-2">Remove</button>
                 </div>
               </div>
            </div>
          ))}
          {cart.length === 0 && <div className="h-full flex items-center justify-center opacity-40 font-medium text-sm text-slate-400">Ticket is empty</div>}
        </div>

        <div className="p-6 border-t border-slate-50">
          <button type="button" onClick={() => setIsSaveModalOpen(true)} disabled={cart.length === 0} className="w-full mb-3 py-3 rounded-xl font-medium border border-emerald-100 text-emerald-600 bg-emerald-50/50 hover:bg-emerald-50 text-sm disabled:opacity-40 disabled:hover:bg-transparent active:scale-95 transition-all">Save Ticket</button>
          <button type="button" disabled={cart.length === 0} className="w-full py-4 rounded-xl font-semibold text-white bg-[#FC687D] shadow-lg shadow-rose-100 flex items-center justify-center transition-all disabled:opacity-50 active:scale-[0.98]">
             <span className="text-lg">Charge • ₱{subtotal.toFixed(0)}</span>
          </button>
        </div>
      </div>

      {/* ─── MODAL CONTROLLERS ─── */}
      {selectedItemForModal && (
        <AddToCartModal 
          item={selectedItemForModal} 
          onClose={() => setSelectedItemForModal(null)} 
          onAddToCart={(d) => { setCart([...cart, d]); setSelectedItemForModal(null); setSuccessMessage(`${d.name} added`); }} 
        />
      )}
      {isSaveModalOpen && <SaveTicketModal onClose={() => setIsSaveModalOpen(false)} onSave={handleSaveTicket} autoName={attachedCustomer ? `${attachedCustomer.name} (${orderType})` : orderType} />}
      {isOpenTicketsModalOpen && <OpenTicketsModal onClose={() => setIsOpenTicketsModalOpen(false)} onRecall={handleRecallTicket} />}
      {successMessage && <SuccessModal message={successMessage} onClose={() => setSuccessMessage("")} />}
    </div>
  );
}