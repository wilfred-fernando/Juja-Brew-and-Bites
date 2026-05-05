"use client";

import { useState, useEffect } from "react";
import { MenuItem, MenuCategory, Order } from "@/api/entities";

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

// Distinct Loyverse-style category colors
const COLORS = ["#FC687D", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];

export default function POS() {
  const [items, setItems]     = useState([]);
  const [cats, setCats]       = useState([]);
  const [cat, setCat]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [cart, setCart]       = useState([]);
  const [type, setType]       = useState("Dine-In");
  const [cname, setCname]     = useState("");
  const [table, setTable]     = useState("");
  const [notes, setNotes]     = useState("");
  const [disc, setDisc]       = useState(0);
  const [showDisc, setShowDisc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    Promise.all([MenuItem.list(), MenuCategory.list()])
      .then(([mi, mc]) => {
        setCats((mc||[]).filter(c=>c.is_active!==false).sort((a,b)=>(a.sort_order||99)-(b.sort_order||99)));
        setItems((mi||[]).filter(i=>i.is_available!==false));
      })
      .catch(()=>{})
      .finally(()=>setLoading(false));
  }, []);

  const filtered = items.filter(i => (cat==="ALL"||i.category===cat) && (!search||i.name.toLowerCase().includes(search.toLowerCase())));
  const catColor = n => { const idx=cats.findIndex(c=>c.name===n); return COLORS[idx%COLORS.length]||"#FC687D"; };
  const getQty   = id => (cart.find(e=>e.id===id)||{}).qty || 0;

  const add = item => setCart(c => { const i=c.findIndex(e=>e.id===item.id); if(i>=0){const n=[...c];n[i]={...n[i],qty:n[i].qty+1};return n;} return [...c,{id:item.id,name:item.name,price:item.price,qty:1}]; });
  const upd = (id,d) => setCart(c => c.map(e=>e.id===id?{...e,qty:e.qty+d}:e).filter(e=>e.qty>0));
  const clear = () => { setCart([]); setCname(""); setTable(""); setNotes(""); setDisc(0); };

  const sub  = cart.reduce((s,e)=>s+e.price*e.qty,0);
  const damt  = sub*disc/100;
  const total = sub-damt;

  const place = () => {
    if(!cart.length||busy) return;
    setBusy(true);
    const np=[]; if(table) np.push("Table:"+table); if(disc>0) np.push("Disc:"+disc+"%"); if(notes) np.push(notes);
    Order.create({
      customer_name: cname||(type==="Dine-In"&&table?"Table "+table:"Walk-in"),
      customer_email:"", customer_phone:"",
      items: cart.map(e=>({id:e.id,name:e.name,price:e.price,quantity:e.qty,subtotal:e.price*e.qty})),
      total_amount:total, status:"Confirmed", payment_status:"Paid",
      order_type:type, notes:np.join(" | "),
    })
    .then(o => { setReceipt({id:o.id,cart:[...cart],sub,damt,total,disc,cname,table,type}); clear(); })
    .catch(()=>alert("Order failed. Try again."))
    .finally(()=>setBusy(false));
  };

  if(loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7]">
      <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full"></div>
    </div>
  );

  return (
    <div className="h-screen w-full flex overflow-hidden bg-slate-50 animate-in fade-in duration-500">
      
      {/* LEFT PANEL: MENU GRID (Loyverse Style) */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#FFF5F7]">
        
        {/* Top Actions */}
        <div className="flex-shrink-0 flex items-center gap-4 px-4 py-3 bg-white border-b border-rose-50 shadow-sm z-10">
          <button className="p-2 hover:bg-slate-50 rounded-lg transition-all text-slate-400">☰</button>
          
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-lg text-sm font-semibold focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all" />
          </div>

          <div className="flex gap-2 bg-slate-50 p-1 rounded-lg border border-slate-100 ml-auto">
            {["Dine-In","Take-Out"].map(t=>(
              <button key={t} onClick={()=>setType(t)} 
                className={`px-4 py-2 rounded-md font-bold text-xs uppercase tracking-widest transition-all ${
                  type===t ? "bg-white text-[#FC687D] shadow-sm border border-slate-200" : "text-slate-400 hover:text-slate-600"
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Loyverse Tab Categories */}
        <div className="flex-shrink-0 flex gap-2 px-4 py-3 bg-white border-b border-rose-50 overflow-x-auto hide-scrollbar z-10">
          <button onClick={()=>setCat("ALL")} 
            className={`flex-shrink-0 px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-widest transition-all border ${
              cat==="ALL" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
            }`}>
            All Items
          </button>
          {cats.map((c)=>(
            <button key={c.id} onClick={()=>setCat(c.name)} 
              className={`flex-shrink-0 px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-widest transition-all border ${
                cat===c.name ? "bg-[#FC687D] text-white border-[#FC687D]" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
              }`}>
              {c.name}
            </button>
          ))}
        </div>

        {/* Loyverse Square Grid */}
        <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4 pb-20">
            {filtered.map(item=>{
              const qty = getQty(item.id);
              const hexColor = catColor(item.category);
              return (
                <button key={item.id} onClick={()=>add(item)} 
                  className="relative aspect-square flex flex-col p-3 md:p-4 rounded-[16px] md:rounded-[20px] text-left cursor-pointer active:scale-95 transition-all duration-200 hover:shadow-md border border-white/50"
                  style={{ backgroundColor: `${hexColor}15` }}> {/* Soft 15% opacity tint */}
                  
                  {/* Color Dot top right */}
                  <div className="absolute top-3 right-3 w-3 h-3 rounded-full opacity-60" style={{ backgroundColor: hexColor }} />
                  
                  <div className="mt-auto">
                    <p className="text-slate-800 font-bold text-sm md:text-base leading-tight mb-1 line-clamp-3">{item.name}</p>
                    <p className="font-black text-sm" style={{ color: hexColor }}>₱{item.price}</p>
                  </div>

                  {/* Quantity Badge */}
                  {qty>0 && (
                    <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-sm font-black text-white shadow-lg animate-in zoom-in duration-200">
                      {qty}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: THE TICKET */}
      <div className="w-[380px] flex-shrink-0 flex flex-col bg-white border-l border-slate-200 shadow-2xl z-20">

        {/* Ticket Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <h2 className="font-black text-2xl text-slate-800">Ticket</h2>
          {cart.length > 0 && (
            <button onClick={clear} className="text-slate-400 hover:text-red-500 font-bold text-sm transition-colors uppercase tracking-widest active:scale-95">
              Clear
            </button>
          )}
        </div>

        {/* Quick Customer Assignment */}
        <div className="flex-shrink-0 flex gap-2 p-4 border-b border-slate-100 bg-white">
          <input value={cname} onChange={e=>setCname(e.target.value)} placeholder="Assign Customer..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm font-semibold focus:outline-none focus:border-[#FC687D] transition-all" />
          <input value={table} onChange={e=>setTable(e.target.value)} placeholder="Table"
            className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-3 py-3 text-sm font-semibold focus:outline-none focus:border-[#FC687D] transition-all text-center" />
        </div>

        {/* Cart/Ticket Items */}
        <div className="flex-1 overflow-y-auto hide-scrollbar bg-white">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-300">
              <span className="text-6xl mb-4 opacity-50">🧾</span>
              <p className="font-bold text-sm uppercase tracking-widest">No Items</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {cart.map(item => (
                <div key={item.id} className="flex flex-col p-3 rounded-lg hover:bg-slate-50 transition-colors group">
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-bold text-slate-800 text-sm leading-tight pr-4">{item.name}</p>
                    <p className="font-black text-slate-800 text-sm">₱{(item.price*item.qty).toLocaleString()}</p>
                  </div>
                  
                  {/* Stepper Control */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center bg-slate-100 rounded-md border border-slate-200">
                      <button onClick={()=>upd(item.id,-1)} className="w-8 h-8 flex items-center justify-center text-slate-500 font-black text-lg hover:text-rose-500 hover:bg-rose-50 rounded-l-md active:bg-rose-100">−</button>
                      <span className="w-8 text-center font-black text-slate-800 text-sm">{item.qty}</span>
                      <button onClick={()=>upd(item.id,1)} className="w-8 h-8 flex items-center justify-center text-slate-500 font-black text-lg hover:text-emerald-500 hover:bg-emerald-50 rounded-r-md active:bg-emerald-100">+</button>
                    </div>
                    <span className="text-slate-400 font-semibold text-[11px]">₱{item.price} each</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Discount Bar */}
        <div className="flex-shrink-0 bg-slate-50 border-t border-slate-200">
          <button onClick={()=>setShowDisc(!showDisc)} className="w-full flex justify-between items-center px-6 py-4 hover:bg-slate-100 active:bg-slate-200 transition-colors">
            <span className="font-bold text-sm text-slate-500 uppercase tracking-widest">Discount {disc>0 ? `(${disc}%)` : ""}</span>
            <span className="text-rose-500 font-bold text-sm">{damt > 0 ? `-₱${damt.toFixed(0)}` : "Add >"}</span>
          </button>
          
          {showDisc && (
            <div className="flex gap-2 px-6 pb-4">
              {[0,5,10,15,20].map(d=>(
                <button key={d} onClick={()=>{setDisc(d);setShowDisc(false);}} 
                  className={`flex-1 py-2.5 rounded-lg font-bold text-xs transition-all active:scale-95 border ${
                    disc===d ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-300"
                  }`}>
                  {d===0?"None":d+"%"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* The Massive Charge Button Area */}
        <div className="flex-shrink-0 bg-white p-6 border-t border-slate-200">
          <div className="flex justify-between items-end mb-4">
            <span className="font-bold text-slate-500 uppercase tracking-widest text-sm">Total</span>
            <span className="font-black text-3xl text-slate-800 tracking-tight">₱{total.toLocaleString()}</span>
          </div>
          
          <button onClick={place} disabled={!cart.length||busy}
            className="w-full py-5 rounded-[20px] font-black text-xl text-white transition-all active:scale-95 flex items-center justify-center gap-2 shadow-xl disabled:opacity-50 disabled:active:scale-100 disabled:shadow-none"
            style={{ backgroundColor: cart.length ? "#10b981" : "#cbd5e1" }}> {/* Emerald Green for Charge, like Loyverse */}
            {busy ? "Processing..." : `Charge ₱${total.toLocaleString()}`}
          </button>
        </div>
      </div>

      {/* RECEIPT MODAL */}
      {receipt && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[24px] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="p-8 text-center border-b border-slate-100">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">✓</div>
              <h2 className="font-black text-2xl text-slate-800 mb-1">Transaction Complete</h2>
              <p className="font-mono text-xs font-bold text-slate-400">Order #{receipt.id?.slice(-8).toUpperCase()}</p>
            </div>
            
            <div className="p-6 max-h-[40vh] overflow-y-auto hide-scrollbar bg-slate-50">
              {receipt.cart.map(item=>(
                <div key={item.id} className="flex justify-between items-start mb-3 text-sm">
                  <span className="font-bold text-slate-600 flex-1 pr-4">{item.name} <span className="text-slate-400 text-xs ml-1">x{item.qty}</span></span>
                  <span className="font-black text-slate-800">₱{(item.price*item.qty).toLocaleString()}</span>
                </div>
              ))}
              
              <div className="border-t border-slate-200 pt-4 mt-4 space-y-2">
                {receipt.damt>0 && (
                  <div className="flex justify-between text-xs font-bold text-rose-500">
                    <span>Discount ({receipt.disc}%)</span>
                    <span>-₱{receipt.damt.toFixed(0)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-xl text-slate-800 pt-2">
                  <span>Total Paid</span>
                  <span>₱{receipt.total.toLocaleString()}</span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col gap-2 p-6 bg-white">
              <button onClick={()=>window.print()} className="w-full py-4 rounded-xl border border-slate-200 bg-white font-bold text-slate-600 text-sm hover:bg-slate-50 active:scale-95 transition-all">
                Print Receipt
              </button>
              <button onClick={()=>setReceipt(null)} className="w-full py-4 rounded-xl border-none bg-slate-800 text-white font-bold text-sm shadow-md hover:bg-slate-700 active:scale-95 transition-all">
                New Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}