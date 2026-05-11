"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

// ─── 1. MODAL: ADD TO CART (LUXURY VERSION) ───
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
      <div className="bg-white w-full max-w-md rounded-t-[40px] md:rounded-[40px] overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom-10 zoom-in-95 duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]">
        <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center bg-white">
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">{item.name}</h2>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-600 text-2xl font-light p-2">✕</button>
        </div>
        <div className="p-8 space-y-8">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest mb-3 block text-[#FC687D]">Select Quantity</label>
            <div className="flex items-center border border-slate-100 rounded-[24px] overflow-hidden bg-slate-50/50 shadow-inner h-16">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-20 h-full flex items-center justify-center text-slate-400 hover:bg-white hover:text-[#FC687D] transition-all">—</button>
              <div className="flex-1 text-center font-black text-xl text-slate-800">{quantity}</div>
              <button onClick={() => setQuantity(quantity + 1)} className="w-20 h-full flex items-center justify-center text-slate-400 hover:bg-white hover:text-[#FC687D] transition-all">＋</button>
            </div>
          </div>
          <button 
            onClick={handleSave} 
            className="w-full py-5 rounded-[24px] font-bold text-white text-lg shadow-xl shadow-rose-100 transition-all active:scale-[0.95] hover:brightness-110" 
            style={{ backgroundColor: brandColor }}
          >
            Add to ticket • ₱{(calculateUnitPrice() * quantity).toFixed(0)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 2. MENU CARD COMPONENT (LUXURY HOVER & TRANSITIONS) ───
function MenuCard({ item, onClick, index }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={() => onClick(item)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="bg-white p-5 rounded-[32px] border border-slate-100 flex items-center gap-5 transition-all duration-350 group relative overflow-hidden h-[110px]"
      style={{
        animationDelay: `${index * 60}ms`,
        transitionTimingFunction: "cubic-bezier(0.25,0.46,0.45,0.94)",
        transform: isHovered ? "translateY(-8px)" : "translateY(0)",
        boxShadow: isHovered ? "0 20px 40px rgba(252,104,125,0.12)" : "0 4px 10px rgba(0,0,0,0.02)",
      }}
    >
      <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center text-2xl transition-transform duration-500 group-hover:scale-110">
        {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover rounded-2xl" /> : "🍵"}
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#FC687D] mb-1">{item.category}</p>
        <h3 className="font-bold text-slate-800 text-base truncate">{item.name}</h3>
        <p className="text-sm font-black text-slate-900 mt-1">₱{Number(item.price).toFixed(0)}</p>
      </div>
      <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity">
         <span className="bg-[#FC687D] text-white w-8 h-8 rounded-full flex items-center justify-center text-xs">＋</span>
      </div>
    </button>
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
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = "https://admin.jujabrewandbites.com/login"; 
        return;
      }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (profile?.role !== 'admin' && profile?.role !== 'cashier' && profile?.role !== 'super_admin') {
        alert("Access Denied.");
        window.location.href = "https://jujabrewandbites.com";
        return;
      }
      fetchData();
    };
    checkAuth();
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
    if (dRes.data) setDiningOptions(dRes.data);
    setLoading(false);
  }

  const subtotal = cart.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);

  if (loading) return <div className="h-screen flex items-center justify-center bg-white"><div className="w-8 h-8 border-4 border-rose-100 border-t-[#FC687D] animate-spin rounded-full"></div></div>;

  return (
    <div className="flex h-screen bg-[#FDFDFD] font-sans overflow-hidden text-slate-800">
      
      {/* LEFT: MENU GRID (RESPONSIVE) */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <header className="p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col">
               <h1 className="text-2xl font-black tracking-tight">Juja Terminal</h1>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Pasong Tamo Branch</p>
            </div>
            
            <div className="flex gap-4">
               <select 
                value={activeCategory} 
                onChange={(e) => setActiveCategory(e.target.value)} 
                className="bg-slate-50 px-5 py-3 rounded-2xl font-bold text-xs text-slate-700 outline-none border border-slate-100 focus:border-[#FC687D]/20 transition-all"
               >
                 <option value="ALL">All Menu</option>
                 {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
               </select>
               
               <div className="relative w-full md:w-64 group">
                 <input 
                  type="text" 
                  placeholder="Search items..." 
                  value={menuSearch} 
                  onChange={(e) => setMenuSearch(e.target.value)} 
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-xs focus:outline-none focus:bg-white focus:border-[#FC687D]/20 transition-all shadow-sm" 
                 />
                 <span className="absolute left-4 top-1/2 -translate-y-1/2 opacity-30">🔍</span>
               </div>
            </div>
        </header>

        {/* GRID LAYOUT: grid-cols-1 (Mobile), md:grid-cols-2, lg:grid-cols-3 */}
        <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-max hide-scrollbar animate-in fade-in duration-700">
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

      {/* RIGHT: TICKET SIDEBAR (HIDDEN ON MOBILE UNTIL NEEDED) */}
      <div className="hidden lg:flex w-[400px] bg-white border-l border-slate-100 flex-col relative z-10 shadow-[0_0_60px_rgba(0,0,0,0.03)]">
        {/* Sidebar content (Customer search, cart items, subtotal) remains the same as your logic */}
        <div className="p-8 border-b border-slate-50">
           <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-bold">{attachedCustomer ? attachedCustomer.name : "Current Ticket"}</h2>
              <button onClick={() => setIsOpenTicketsModalOpen(true)} className="w-12 h-12 flex items-center justify-center bg-slate-50 border border-slate-100 rounded-2xl text-xl hover:bg-rose-50 transition-all active:scale-90">📋</button>
           </div>
           
           <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Find customer..." 
                className="flex-1 p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs outline-none focus:border-[#FC687D]/20 transition-all"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
              <button className="px-5 bg-slate-900 text-white rounded-2xl text-xs font-bold active:scale-95 transition-all">Scan</button>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 hide-scrollbar">
           {cart.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center opacity-20">
                <span className="text-6xl mb-4">🛒</span>
                <p className="font-bold uppercase tracking-widest text-[10px]">Ticket Empty</p>
             </div>
           ) : (
             cart.map((item) => (
               <div key={item.cartItemId} className="flex justify-between items-center animate-in slide-in-from-right-4 duration-300">
                  <div className="flex flex-col">
                    <p className="font-bold text-sm text-slate-800">{item.name} <span className="text-[#FC687D] ml-1">x{item.quantity}</span></p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">₱{item.unitPrice}</p>
                  </div>
                  <p className="font-black text-sm text-slate-800">₱{item.unitPrice * item.quantity}</p>
               </div>
             ))
           )}
        </div>

        <div className="p-8 border-t border-slate-50 space-y-4">
           <div className="flex justify-between items-end mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Grand Total</p>
              <p className="text-3xl font-black text-slate-900 leading-none">₱{subtotal.toFixed(0)}</p>
           </div>
           <button 
            disabled={cart.length === 0}
            className="w-full py-5 bg-[#FC687D] text-white rounded-[24px] font-black text-lg shadow-xl shadow-rose-100 active:scale-[0.98] transition-all disabled:opacity-30"
           >
             Charge Order →
           </button>
        </div>
      </div>

      {/* MODAL CONTROLLERS */}
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
      {successMessage && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[400] bg-slate-900 text-white px-8 py-4 rounded-full font-bold text-sm shadow-2xl animate-in fade-in slide-in-from-bottom-5">✓ {successMessage}</div>}
    </div>
  );
}