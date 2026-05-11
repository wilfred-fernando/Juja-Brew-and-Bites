"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

// ==========================================
// FUNCTION: SAVE TICKET MODAL (Custom UI)
// ==========================================
function SaveTicketModal({ onSave, onClose, defaultName }) {
  const [name, setName] = useState(defaultName || "");

  return (
    <div className="fixed inset-0 z-[500] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95 duration-300">
        <h3 className="text-xl font-semibold text-slate-800 mb-2">Save Ticket</h3>
        <p className="text-sm text-slate-500 mb-6">Enter a label to identify this order later.</p>
        
        <input 
          autoFocus
          type="text" 
          value={name} 
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Table 5 or Customer Name"
          className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-base outline-none focus:bg-white focus:border-rose-400 transition-all mb-8"
        />

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-4 bg-slate-100 rounded-2xl text-sm font-medium text-slate-600">Cancel</button>
          <button 
            onClick={() => onSave(name)} 
            className="flex-[2] py-4 bg-[#FC687D] rounded-2xl text-sm font-medium text-white shadow-lg shadow-rose-100 active:scale-95 transition-all"
          >
            Confirm Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// FUNCTION: ADD TO CART MODAL
// ==========================================
function AddToCartModal({ item, onClose, onAddToCart }) {
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState({});
  const [instructions, setInstructions] = useState("");

  useEffect(() => {
    if (item.variants) {
      const defaults = {};
      item.variants.forEach(g => { if (g.isRequired && g.options.length > 0) defaults[g.id] = [g.options[0]]; });
      setSelections(defaults);
    }
  }, [item]);

  const toggleOption = (group, opt) => {
    const current = selections[group.id] || [];
    if (!group.isMultiSelect) { setSelections({ ...selections, [group.id]: [opt] }); } 
    else {
      const exists = current.find(o => o.id === opt.id);
      setSelections({ ...selections, [group.id]: exists ? current.filter(o => o.id !== opt.id) : [...current, opt] });
    }
  };

  const unitPrice = (Number(item.price) || 0) + Object.values(selections).flat().reduce((sum, o) => sum + (Number(o.price) || 0), 0);

  return (
    <div className="fixed inset-0 z-[250] bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full max-w-md rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="p-5 border-b border-slate-50 flex justify-between items-center">
          <h2 className="text-lg text-slate-800 font-medium">{item.name}</h2>
          <button onClick={onClose} className="text-slate-300 text-2xl px-2">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {item.variants?.map(g => (
            <div key={g.id} className="space-y-3">
              <div className="flex justify-between text-[11px] text-slate-400 uppercase"><span>{g.name}</span>{g.isRequired && <span className="text-rose-400">Required</span>}</div>
              <div className="grid gap-2">
                {g.options.map(o => {
                  const sel = selections[g.id]?.find(x => x.id === o.id);
                  return (
                    <button key={o.id} onClick={() => toggleOption(g, o)} className={`flex justify-between p-4 rounded-xl border text-sm transition-all ${sel ? "border-rose-300 bg-rose-50/30" : "border-slate-100 bg-white"}`}>
                      <span>{o.name}</span>
                      <span className="text-xs text-slate-400">{Number(o.price) > 0 ? `+₱${o.price}` : "—"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Add specific notes..." className="w-full p-4 bg-slate-50 border-none rounded-xl text-sm outline-none h-20 resize-none" />
        </div>
        <div className="p-5 border-t border-slate-50">
          <div className="flex items-center border border-slate-100 rounded-xl overflow-hidden h-12 mb-4">
            <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-16 h-full text-xl text-slate-400">&minus;</button>
            <div className="flex-1 text-center text-slate-800">{quantity}</div>
            <button onClick={() => setQuantity(quantity + 1)} className="w-16 h-full text-xl text-slate-400">&#43;</button>
          </div>
          <button onClick={() => onAddToCart({ ...item, cartItemId: Date.now(), unitPrice, quantity, variantDetails: Object.values(selections).flat().map(o => o.name).join(", "), instructions })} className="w-full py-4 rounded-xl text-white font-medium" style={{ backgroundColor: "#FC687D" }}>
            Add · ₱{(unitPrice * quantity).toFixed(0)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// MAIN POS TERMINAL
// ==========================================
export default function POSPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [menuSearch, setMenuSearch] = useState("");
  const [selectedItemForModal, setSelectedItemForModal] = useState(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [orderType, setOrderType] = useState("Dine In");

  useEffect(() => {
    fetchData();
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

  // REPLACEMENT FOR BROWSER PROMPT
  const executeSaveTicket = async (label) => {
    if (!label.trim()) return;
    const { error } = await supabase.from("open_tickets").insert([{
      ticket_name: label,
      items: cart,
      total_amount: subtotal,
      order_type: orderType
    }]);
    if (!error) {
      setCart([]);
      setIsSaveModalOpen(false);
    }
  };

  const subtotal = cart.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);

  if (loading) return <div className="h-screen flex items-center justify-center bg-white"><div className="w-6 h-6 border-t-rose-400 animate-spin rounded-full border-2 border-slate-100"></div></div>;

  return (
    <div className="flex h-screen bg-white font-sans overflow-hidden text-slate-800">
      <div className="flex-1 flex flex-col min-w-0">
        <header className="p-4 border-b border-slate-50 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Juja Terminal</h1>
          <div className="flex gap-2">
            <select value={activeCategory} onChange={(e) => setActiveCategory(e.target.value)} className="bg-slate-50 px-3 py-2 rounded-lg text-xs outline-none">
              <option value="ALL">All Categories</option>
              {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
            </select>
            <input type="text" placeholder="Search..." value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} className="px-3 py-2 bg-slate-50 rounded-lg text-xs outline-none" />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.filter(i => (activeCategory === "ALL" || i.category === activeCategory) && i.name.toLowerCase().includes(menuSearch.toLowerCase())).map((i) => (
            <button key={i.id} onClick={() => setSelectedItemForModal(i)} className="bg-white p-3 rounded-2xl border border-slate-100 flex items-center gap-3 transition-all h-20">
              <div className="w-12 h-12 rounded-lg bg-rose-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                {i.image_url ? <img src={i.image_url} className="w-full h-full object-cover" /> : "☕"}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[10px] text-rose-400 mb-0.5">{i.category}</p>
                <h3 className="text-sm text-slate-800 truncate leading-tight font-medium">{i.name}</h3>
                <p className="text-sm text-slate-400">₱{Number(i.price).toFixed(0)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="w-[340px] bg-white border-l border-slate-100 flex flex-col">
        <div className="p-4 border-b border-slate-50">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xs font-semibold text-slate-400 uppercase">Current Ticket</h2>
            <div className="flex gap-2">
              <button onClick={() => setConfirmClear(true)} className="text-slate-300 hover:text-rose-500 text-xl transition-colors">✕</button>
              <button onClick={() => setIsSaveModalOpen(true)} className="w-8 h-8 flex items-center justify-center bg-slate-50 rounded-lg text-sm">📥</button>
            </div>
          </div>
          <select value={orderType} onChange={(e) => setOrderType(e.target.value)} className="w-full bg-slate-50 rounded-lg px-3 py-2 text-[11px] font-medium text-slate-500 outline-none">
            <option>Dine In</option><option>Take Out</option><option>Delivery</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? <div className="h-full flex items-center justify-center opacity-10 text-[10px] uppercase font-semibold">Ready for orders</div> : 
            cart.map((item, idx) => (
              <div key={item.cartItemId} className="flex justify-between items-start border-b border-slate-50 pb-2">
                <div className="flex-1 pr-3 text-left">
                  <p className="text-sm text-slate-800 leading-tight font-medium">{item.name} <span className="text-rose-400">x{item.quantity}</span></p>
                  <p className="text-[10px] text-slate-400 mt-1 italic">{item.variantDetails}</p>
                </div>
                <p className="text-sm text-slate-800 font-medium">₱{item.unitPrice * item.quantity}</p>
              </div>
            ))
          }
        </div>

        <div className="p-4 border-t border-slate-50">
          <div className="flex justify-between items-end mb-4 px-1">
            <p className="text-[11px] text-slate-400 uppercase font-medium">Subtotal</p>
            <p className="text-2xl font-semibold text-slate-900">₱{subtotal.toFixed(0)}</p>
          </div>
          <button disabled={cart.length === 0} className="w-full py-4 bg-slate-900 text-white rounded-xl text-sm font-medium active:scale-[0.98] disabled:opacity-30">Charge Order</button>
        </div>
      </div>

      {/* --- MODAL CONTROLLERS --- */}
      {selectedItemForModal && (
        <AddToCartModal item={selectedItemForModal} onClose={() => setSelectedItemForModal(null)} onAddToCart={(d) => { setCart([...cart, d]); setSelectedItemForModal(null); }} />
      )}
      
      {isSaveModalOpen && (
        <SaveTicketModal defaultName="Quick Order" onClose={() => setIsSaveModalOpen(false)} onSave={executeSaveTicket} />
      )}

      {confirmClear && (
        <div className="fixed inset-0 z-[500] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl text-center">
            <h3 className="text-xl font-semibold text-slate-800 mb-2">Empty Ticket?</h3>
            <p className="text-sm text-slate-500 mb-8">This will remove all items from this order.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmClear(false)} className="flex-1 py-4 bg-slate-100 rounded-2xl text-sm font-medium">Cancel</button>
              <button onClick={() => { setCart([]); setConfirmClear(false); }} className="flex-[2] py-4 bg-[#FC687D] rounded-2xl text-sm font-medium text-white shadow-lg">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}