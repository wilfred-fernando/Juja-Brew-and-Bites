"use client";

import { useState, useEffect } from "react";
import { MenuItem, MenuCategory, Order } from "@/api/entities";
import { supabase } from "@/lib/supabase"; // Required for pulling loyalty members

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";
const COLORS = ["#FC687D", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];

export default function POS() {
  const [items, setItems]     = useState([]);
  const [cats, setCats]       = useState([]);
  const [cat, setCat]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [cart, setCart]       = useState([]);
  const [notes, setNotes]     = useState("");
  const [disc, setDisc]       = useState(0);
  const [showDisc, setShowDisc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [showMobileTicket, setShowMobileTicket] = useState(false);

  // --- NEW: Loyalty & Customer State ---
  const [members, setMembers] = useState([]);
  const [custSearch, setCustSearch] = useState("");
  const [cname, setCname] = useState("");
  const [showCustList, setShowCustList] = useState(false);

  // --- NEW: Dining Options State ---
  const [orderType, setOrderType] = useState("Table"); // Default
  const [tableNum, setTableNum] = useState("");

  useEffect(() => {
    // 1. Fetch Menu Data
    Promise.all([MenuItem.list(), MenuCategory.list()])
      .then(([mi, mc]) => {
        setCats((mc||[]).filter(c=>c.is_active!==false).sort((a,b)=>(a.sort_order||99)-(b.sort_order||99)));
        setItems((mi||[]).filter(i=>i.is_available!==false));
      })
      .catch(()=>{})
      .finally(()=>setLoading(false));

    // 2. Fetch Loyalty Members for the Customer Dropdown
    supabase.from("loyalty_members").select("*")
      .then(({ data }) => { if (data) setMembers(data); });
  }, []);

  const filtered = items.filter(i => (cat==="ALL"||i.category===cat) && (!search||i.name.toLowerCase().includes(search.toLowerCase())));
  const catColor = n => { const idx=cats.findIndex(c=>c.name===n); return COLORS[idx%COLORS.length]||"#FC687D"; };
  const getQty   = id => (cart.find(e=>e.id===id)||{}).qty || 0;

  const add = item => setCart(c => { const i=c.findIndex(e=>e.id===item.id); if(i>=0){const n=[...c];n[i]={...n[i],qty:n[i].qty+1};return n;} return [...c,{id:item.id,name:item.name,price:item.price,qty:1}]; });
  const upd = (id,d) => setCart(c => c.map(e=>e.id===id?{...e,qty:e.qty+d}:e).filter(e=>e.qty>0));
  
  const clear = () => { 
    setCart([]); setCname(""); setCustSearch(""); setTableNum(""); setNotes(""); setDisc(0); setShowMobileTicket(false); setOrderType("Table");
  };

  const sub  = cart.reduce((s,e)=>s+e.price*e.qty,0);
  const damt  = sub*disc/100;
  const total = sub-damt;

  // --- UPDATED: Place Order (Handles both "Save Ticket" and "Charge") ---
  const place = (isPaid = true) => {
    if(!cart.length||busy) return;
    setBusy(true);
    
    const np=[]; 
    // Format the table/VIP room number into notes
    if(tableNum && (orderType === "VIP Room" || orderType === "Table")) np.push(`${orderType} #: ${tableNum}`);
    if(disc>0) np.push("Disc:"+disc+"%"); 
    if(notes) np.push(notes);

    Order.create({
      customer_name: cname || "Walk-in",
      customer_email:"", customer_phone:"",
      items: cart.map(e=>({id:e.id,name:e.name,price:e.price,quantity:e.qty,subtotal:e.price*e.qty})),
      total_amount: total, 
      status: isPaid ? "Confirmed" : "Open",          // Open for Saved Tickets
      payment_status: isPaid ? "Paid" : "Unpaid",     // Unpaid for Saved Tickets
      order_type: orderType, 
      notes: np.join(" | "),
    })
    .then(o => { 
      setReceipt({
        id: o.id, cart: [...cart], sub, damt, total, disc, isPaid,
        cname: cname || "Walk-in", 
        type: orderType,
        table: tableNum ? `${orderType} ${tableNum}` : orderType
      }); 
      clear(); 
    })
    .catch(()=>alert("Order failed. Try again."))
    .finally(()=>setBusy(false));
  };

  // Filter loyalty members based on search
  const filteredMembers = members.filter(m => 
    (m["Customer name"] || "").toLowerCase().includes(custSearch.toLowerCase()) ||
    (m["Phone"] || "").includes(custSearch)
  );

  if(loading) return (
    <div className="h-screen w-full flex items-center justify-center bg-[#FFF5F7]">
      <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full"></div>
    </div>
  );

  return (
    <div className="h-[100dvh] w-full flex flex-col lg:flex-row overflow-hidden bg-slate-50 animate-in fade-in duration-500">
      
      {/* LEFT PANEL: MENU GRID */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#FFF5F7] relative h-full">
        
        {/* Top Search Bar */}
        <div className="flex-shrink-0 flex items-center gap-3 px-3 md:px-4 py-3 bg-white border-b border-rose-50 shadow-sm z-10">
          <button className="p-2.5 hover:bg-slate-50 rounded-lg transition-all text-slate-400 active:scale-95">☰</button>
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Menu..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-lg text-sm font-semibold focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all" />
          </div>
        </div>

        {/* Tab Categories */}
        <div className="flex-shrink-0 flex gap-2 px-3 md:px-4 py-3 bg-white border-b border-rose-50 overflow-x-auto hide-scrollbar z-10">
          <button onClick={()=>setCat("ALL")} 
            className={`flex-shrink-0 px-4 md:px-5 py-2 md:py-2.5 rounded-full font-bold text-[10px] md:text-xs uppercase tracking-widest transition-all active:scale-95 border ${
              cat==="ALL" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
            }`}>
            All Items
          </button>
          {cats.map((c)=>(
            <button key={c.id} onClick={()=>setCat(c.name)} 
              className={`flex-shrink-0 px-4 md:px-5 py-2 md:py-2.5 rounded-full font-bold text-[10px] md:text-xs uppercase tracking-widest transition-all active:scale-95 border ${
                cat===c.name ? "bg-[#FC687D] text-white border-[#FC687D]" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
              }`}>
              {c.name}
            </button>
          ))}
        </div>

        {/* Loyverse Square Grid */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4 hide-scrollbar pb-28 lg:pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4">
            {filtered.map(item=>{
              const qty = getQty(item.id);
              const hexColor = catColor(item.category);
              return (
                <button key={item.id} onClick={()=>add(item)} 
                  className="relative aspect-square flex flex-col p-3 md:p-4 rounded-[16px] md:rounded-[20px] text-left cursor-pointer active:scale-[0.98] transition-all duration-200 hover:shadow-md border border-white/50"
                  style={{ backgroundColor: `${hexColor}15` }}>
                  
                  <div className="absolute top-2.5 right-2.5 w-3 h-3 rounded-full opacity-60" style={{ backgroundColor: hexColor }} />
                  
                  <div className="mt-auto">
                    <p className="text-slate-800 font-normal text-xs md:text-sm leading-tight mb-0.5 line-clamp-3">{item.name}</p>
                    <p className="font-black text-sm md:text-base" style={{ color: hexColor }}>₱{item.price}</p>
                  </div>

                  {qty>0 && (
                    <div className="absolute -top-2 -right-2 w-7 h-7 md:w-8 md:h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs md:text-sm font-black text-white shadow-lg animate-in zoom-in duration-200">
                      {qty}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* MOBILE BOTTOM FLOATING BAR */}
        <div className="lg:hidden absolute bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-slate-200 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] z-20 pb-safe">
          <button onClick={() => setShowMobileTicket(true)} 
            className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest text-white flex items-center justify-between px-6 shadow-xl active:scale-95 transition-all ${cart.length ? "bg-[#10b981]" : "bg-slate-400"}`}>
            <span className="flex items-center gap-2">
              <span className="bg-white/20 px-2.5 py-1 rounded-md">{cart.length}</span> Items
            </span>
            <span>View Ticket ➔</span>
          </button>
        </div>
      </div>

      {/* RIGHT PANEL: THE TICKET */}
      <div className={`fixed inset-0 z-50 lg:static lg:z-auto w-full lg:w-[380px] xl:w-[420px] flex-shrink-0 flex flex-col bg-white lg:border-l border-slate-200 shadow-2xl transition-transform duration-300 ${showMobileTicket ? "translate-y-0" : "translate-y-full lg:translate-y-0"}`}>

        {/* Ticket Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 lg:px-5 py-4 border-b border-slate-100 bg-slate-50/50 pt-safe">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowMobileTicket(false)} className="lg:hidden w-8 h-8 flex items-center justify-center bg-slate-200 text-slate-500 rounded-full font-bold active:scale-90">✕</button>
            <h2 className="font-black text-xl text-slate-800">Ticket</h2>
          </div>
          {cart.length > 0 && (
            <button onClick={clear} className="text-slate-400 hover:text-red-500 font-bold text-[10px] transition-colors uppercase tracking-widest active:scale-95 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
              Trash
            </button>
          )}
        </div>

        {/* ─── NEW: CUSTOMER LOYALTY & DINING OPTIONS AREA ─── */}
        <div className="flex-shrink-0 flex flex-col p-4 border-b border-slate-100 bg-white relative z-20">
          
          {/* Customer Autocomplete Input */}
          <div className="relative mb-3">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">👤</span>
            <input 
              value={custSearch} 
              onFocus={() => setShowCustList(true)}
              onBlur={() => setTimeout(() => setShowCustList(false), 200)}
              onChange={e => { setCustSearch(e.target.value); setCname(e.target.value); setShowCustList(true); }}
              placeholder="Search Loyalty Member or Walk-in..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs lg:text-sm font-semibold focus:outline-none focus:border-[#FC687D] transition-all" 
            />
            
            {/* Loyalty Dropdown Results */}
            {showCustList && custSearch && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 shadow-xl rounded-lg max-h-48 overflow-y-auto hide-scrollbar z-50">
                {filteredMembers.length > 0 ? filteredMembers.map(m => (
                  <button key={m.id} onMouseDown={() => { setCustSearch(m["Customer name"]); setCname(m["Customer name"]); setShowCustList(false); }}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors">
                    <p className="font-bold text-slate-800 text-sm leading-tight">{m["Customer name"]}</p>
                    <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{m["Phone"] || "No Phone"} • {m["Customer code"]}</p>
                  </button>
                )) : (
                  <div className="px-4 py-3 text-xs text-slate-400 font-semibold bg-slate-50 italic">Saving as Walk-In: "{custSearch}"</div>
                )}
              </div>
            )}
          </div>

          {/* Dining Option Grid */}
          <div className="grid grid-cols-2 gap-2">
            {["Takeout", "Grab | Panda", "VIP Room", "Table"].map(t => (
              <button key={t} onClick={() => setOrderType(t)}
                className={`py-2 rounded-lg text-[10px] lg:text-xs font-bold uppercase tracking-widest transition-all active:scale-95 border ${
                  orderType === t ? "bg-slate-800 text-white border-slate-800 shadow-md" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                }`}>
                {t}
              </button>
            ))}
          </div>

          {/* Conditional Input for VIP/Table Number */}
          {(orderType === "VIP Room" || orderType === "Table") && (
            <input 
              value={tableNum} onChange={e=>setTableNum(e.target.value)} 
              placeholder={`Enter ${orderType} Number...`}
              className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-xs lg:text-sm font-semibold focus:outline-none focus:border-[#FC687D] transition-all text-center" 
            />
          )}
        </div>

        {/* Cart/Ticket Items */}
        <div className="flex-1 overflow-y-auto hide-scrollbar bg-white">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-300">
              <span className="text-5xl lg:text-6xl mb-4 opacity-50">🧾</span>
              <p className="font-bold text-xs uppercase tracking-widest">No Items Added</p>
            </div>
          ) : (
            <div className="p-2 space-y-1 pb-4">
              {cart.map(item => (
                <div key={item.id} className="flex flex-col p-3 rounded-lg border border-slate-50 hover:bg-slate-50 transition-colors group">
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-normal text-slate-800 text-xs lg:text-sm leading-tight pr-4">{item.name}</p>
                    <p className="font-black text-slate-800 text-sm">₱{(item.price*item.qty).toLocaleString()}</p>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex items-center bg-slate-100 rounded-md border border-slate-200">
                      <button onClick={()=>upd(item.id,-1)} className="w-8 h-8 flex items-center justify-center text-slate-500 font-black text-lg hover:text-rose-500 hover:bg-rose-50 rounded-l-md active:bg-rose-100 active:scale-95">−</button>
                      <span className="w-8 text-center font-black text-slate-800 text-sm">{item.qty}</span>
                      <button onClick={()=>upd(item.id,1)} className="w-8 h-8 flex items-center justify-center text-slate-500 font-black text-lg hover:text-emerald-500 hover:bg-emerald-50 rounded-r-md active:bg-emerald-100 active:scale-95">+</button>
                    </div>
                    <span className="text-slate-400 font-semibold text-[10px] lg:text-[11px]">₱{item.price} each</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Discount Bar */}
        <div className="flex-shrink-0 bg-slate-50 border-t border-slate-200">
          <button onClick={()=>setShowDisc(!showDisc)} className="w-full flex justify-between items-center px-4 lg:px-5 py-3 hover:bg-slate-100 active:bg-slate-200 transition-colors">
            <span className="font-bold text-xs text-slate-500 uppercase tracking-widest">Discount {disc>0 ? `(${disc}%)` : ""}</span>
            <span className="text-rose-500 font-bold text-sm">{damt > 0 ? `-₱${damt.toFixed(0)}` : "Add >"}</span>
          </button>
          
          {showDisc && (
            <div className="flex gap-2 px-4 lg:px-5 pb-4">
              {[0,5,10,15,20].map(d=>(
                <button key={d} onClick={()=>{setDisc(d);setShowDisc(false);}} 
                  className={`flex-1 py-2.5 rounded-lg font-bold text-xs transition-all active:scale-95 border ${
                    disc===d ? "bg-[#FC687D] text-white border-[#FC687D] shadow-md" : "bg-white text-slate-600 border-slate-300"
                  }`}>
                  {d===0?"None":d+"%"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ─── NEW: SAVE TICKET vs CHARGE BUTTONS ─── */}
        <div className="flex-shrink-0 bg-white p-4 lg:p-5 border-t border-slate-200 pb-safe">
          <div className="flex justify-between items-end mb-3">
            <span className="font-bold text-slate-500 uppercase tracking-widest text-[11px] lg:text-xs">Total</span>
            <span className="font-black text-2xl lg:text-3xl text-slate-800 tracking-tight">₱{total.toLocaleString()}</span>
          </div>
          
          <div className="flex gap-2 lg:gap-3">
            <button onClick={() => place(false)} disabled={!cart.length||busy}
              className="w-[120px] py-4 rounded-[16px] font-black text-[11px] lg:text-xs uppercase tracking-widest text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-50">
              Save Ticket
            </button>

            <button onClick={() => place(true)} disabled={!cart.length||busy}
              className="flex-1 py-4 rounded-[16px] font-black text-lg text-white transition-all active:scale-95 flex items-center justify-center shadow-xl disabled:opacity-50 disabled:shadow-none"
              style={{ backgroundColor: cart.length ? "#10b981" : "#cbd5e1" }}>
              {busy ? "Wait..." : `Charge ₱${total.toLocaleString()}`}
            </button>
          </div>
        </div>
      </div>

      {/* RECEIPT MODAL */}
      {receipt && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[24px] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="p-6 text-center border-b border-slate-100 bg-[#FFF9FA]">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center text-2xl mx-auto mb-3">✓</div>
              <h2 className="font-black text-xl text-slate-800 mb-1">
                {receipt.isPaid ? "Transaction Complete" : "Ticket Saved!"}
              </h2>
              <p className="font-mono text-[10px] font-bold text-slate-400">Order #{receipt.id?.slice(-8).toUpperCase()}</p>
            </div>
            
            <div className="p-5 max-h-[40vh] overflow-y-auto hide-scrollbar bg-slate-50">
              {receipt.cart.map(item=>(
                <div key={item.id} className="flex justify-between items-start mb-3 text-xs lg:text-sm">
                  <span className="font-bold text-slate-600 flex-1 pr-4">{item.name} <span className="text-slate-400 text-[10px] lg:text-xs ml-1">x{item.qty}</span></span>
                  <span className="font-black text-slate-800">₱{(item.price*item.qty).toLocaleString()}</span>
                </div>
              ))}
              
              <div className="border-t border-slate-200 pt-4 mt-4 space-y-2">
                {receipt.damt>0 && (
                  <div className="flex justify-between text-[10px] lg:text-xs font-bold text-rose-500">
                    <span>Discount ({receipt.disc}%)</span>
                    <span>-₱{receipt.damt.toFixed(0)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-lg text-slate-800 pt-1">
                  <span>{receipt.isPaid ? "Total Paid" : "Balance Due"}</span>
                  <span>₱{receipt.total.toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-white rounded-xl p-3 mt-4 text-[10px] font-bold text-slate-500 border border-slate-100 space-y-1 shadow-sm">
                <p className="flex justify-between"><span className="uppercase tracking-widest text-[8px] text-slate-400">Type</span> <span>{receipt.type}</span></p>
                <p className="flex justify-between"><span className="uppercase tracking-widest text-[8px] text-slate-400">Customer</span> <span>{receipt.cname}</span></p>
                {receipt.table && receipt.type !== "Takeout" && receipt.type !== "Grab | Panda" && (
                  <p className="flex justify-between"><span className="uppercase tracking-widest text-[8px] text-slate-400">Location</span> <span>{receipt.table}</span></p>
                )}
              </div>
            </div>
            
            <div className="flex flex-col gap-2 p-5 bg-white">
              <button onClick={()=>window.print()} className="w-full py-3 rounded-xl border border-slate-200 bg-white font-bold text-slate-600 text-xs hover:bg-slate-50 active:scale-95 transition-all">
                Print Ticket
              </button>
              <button onClick={()=>setReceipt(null)} className="w-full py-3 rounded-xl border-none bg-[#FC687D] text-white font-bold text-xs shadow-md hover:bg-rose-500 active:scale-95 transition-all">
                New Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}