"use client";

import { useState, useEffect } from "react";
import { MenuItem, MenuCategory, Order } from "@/api/entities";

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";
const COLORS = ["#FC687D","#db2777","#9333ea","#2563eb","#0891b2","#059669","#d97706","#ea580c","#7c3aed"];

// Make sure THIS line below exists exactly like this!
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
    <div className="h-screen flex flex-col overflow-hidden bg-[#FFF5F7] animate-in fade-in duration-500" >
      {/* HEADER */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 h-16 bg-white border-b border-rose-50 shadow-sm z-10">
        <div className="flex items-center gap-4">
          <img src={LOGO} alt="Juja" className="h-8 object-contain" />
          <div className="pl-4 border-l border-slate-100">
            <p className="font-normal text-slate-800 text-sm leading-tight">JUJA POS Terminal</p>
            <p className="text-[10px] text-slate-400 font-normal uppercase tracking-widest">Point of Sale</p>
          </div>
        </div>
        <div className="flex gap-3">
          <a href="/kds" target="_blank" className="px-5 py-2 rounded-xl bg-slate-50 text-slate-500 text-[11px] font-normal uppercase tracking-widest hover:bg-slate-100 hover:text-slate-800 transition-all active:scale-95">KDS</a>
          <a href="/admin" className="px-5 py-2 rounded-xl bg-slate-50 text-slate-500 text-[11px] font-normal uppercase tracking-widest hover:bg-slate-100 hover:text-slate-800 transition-all active:scale-95">Admin</a>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* LEFT: MENU */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-[#FFF5F7]">

          {/* Search + type */}
          <div className="flex-shrink-0 flex flex-col sm:flex-row gap-3 p-4 bg-white border-b border-rose-50">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search items..."
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all" />
            </div>
            <div className="flex gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100 overflow-x-auto hide-scrollbar">
              {["Dine-In","Take-Out","Delivery"].map(t=>(
                <button key={t} onClick={()=>setType(t)} 
                  className={`px-5 py-2 rounded-lg font-normal text-[11px] uppercase tracking-widest transition-all whitespace-nowrap active:scale-95 ${
                    type===t ? "bg-white text-[#FC687D] shadow-sm border border-slate-200" : "text-slate-400 hover:text-slate-600"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Category tabs */}
          <div className="flex-shrink-0 flex gap-2 px-4 py-3 bg-white border-b border-rose-50 overflow-x-auto hide-scrollbar shadow-sm z-10">
            <button onClick={()=>setCat("ALL")} 
              className={`flex-shrink-0 px-5 py-2.5 rounded-xl font-normal text-xs uppercase tracking-widest transition-all active:scale-95 border ${
                cat==="ALL" ? "bg-slate-800 text-white border-slate-800 shadow-md" : "bg-white text-slate-500 border-slate-100 hover:bg-slate-50"
              }`}>
              All Items
            </button>
            {cats.map((c,i)=>(
              <button key={c.id} onClick={()=>setCat(c.name)} 
                className={`flex-shrink-0 px-5 py-2.5 rounded-xl font-normal text-xs uppercase tracking-widest transition-all active:scale-95 border flex items-center gap-2 ${
                  cat===c.name ? "bg-[#FC687D] text-white border-[#FC687D] shadow-md shadow-rose-200" : "bg-white text-slate-500 border-slate-100 hover:bg-slate-50"
                }`}>
                <span className="text-base leading-none">{c.icon}</span> {c.name}
              </button>
            ))}
          </div>

          {/* Items grid */}
          <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
              {filtered.map(item=>{
                const qty=getQty(item.id);
                const color=catColor(item.category);
                return (
                  <button key={item.id} onClick={()=>add(item)} 
                    className="relative bg-white border border-rose-50 rounded-[20px] p-4 text-left cursor-pointer hover:shadow-[0_8px_20px_rgba(252,104,125,0.08)] hover:-translate-y-1 transition-all duration-300 active:scale-95 group flex flex-col h-full">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3 opacity-20 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: color }}>
                      <div className="w-3 h-3 rounded-full bg-white shadow-sm" />
                    </div>
                    <p className="text-slate-800 font-normal text-sm mb-1 leading-tight flex-1">{item.name}</p>
                    <p className="text-[#FC687D] font-normal text-base m-0 mt-2">₱{item.price}</p>
                    {qty>0 && (
                      <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-[#FC687D] flex items-center justify-center text-xs font-normal text-white shadow-md animate-in zoom-in duration-200">
                        {qty}
                      </div>
                    )}
                  </button>
                );
              })}
              {filtered.length===0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-400">
                  <span className="text-4xl mb-4 opacity-50">🔍</span>
                  <p className="font-normal text-xs uppercase tracking-widest">No items found</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: CART */}
        <div className="w-80 lg:w-96 flex-shrink-0 flex flex-col bg-white border-l border-rose-100 shadow-xl z-20">

          {/* Cart header */}
          <div className="flex-shrink-0 flex items-center justify-between p-5 border-b border-rose-50">
            <div>
              <p className="font-normal text-xl text-slate-800 m-0">Current Order</p>
              <p className="text-[10px] font-normal text-slate-400 uppercase tracking-widest m-0 mt-1">{cart.length} items</p>
            </div>
            {cart.length>0 && (
              <button onClick={clear} className="text-[10px] font-normal uppercase tracking-widest text-rose-400 hover:text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg active:scale-95 transition-all">
                Clear
              </button>
            )}
          </div>

          {/* Name + table */}
          <div className="flex-shrink-0 flex gap-3 p-4 border-b border-rose-50 bg-slate-50/50">
            <input value={cname} onChange={e=>setCname(e.target.value)} placeholder="Customer Name"
              className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all shadow-sm" />
            <input value={table} onChange={e=>setTable(e.target.value)} placeholder="Table #"
              className="w-20 bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all shadow-sm text-center" />
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto p-4 hide-scrollbar space-y-3">
            {cart.length===0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-300 opacity-70">
                <p className="text-5xl mb-4">🛒</p>
                <p className="font-normal text-sm uppercase tracking-widest">Cart is empty</p>
                <p className="text-[10px] font-normal mt-2">Tap items to add</p>
              </div>
            ) : cart.map(item=>(
              <div key={item.id} className="flex items-center gap-3 bg-white border border-slate-100 shadow-sm rounded-xl p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-slate-800 text-xs font-normal m-0 mb-1 truncate leading-tight">{item.name}</p>
                  <p className="text-slate-400 text-[10px] font-normal m-0">₱{item.price}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 bg-slate-50 rounded-lg p-1 border border-slate-100">
                  <button onClick={()=>upd(item.id,-1)} className="w-7 h-7 rounded-md bg-white border border-slate-200 text-slate-600 font-normal text-xs hover:bg-slate-100 active:scale-90 transition-all shadow-sm">−</button>
                  <span className="text-slate-800 font-normal text-xs min-w-[20px] text-center">{item.qty}</span>
                  <button onClick={()=>upd(item.id,1)} className="w-7 h-7 rounded-md bg-[#FC687D] text-white font-normal text-xs hover:bg-rose-500 active:scale-90 transition-all shadow-sm">+</button>
                </div>
                <p className="text-slate-800 font-normal text-sm min-w-[50px] text-right flex-shrink-0">₱{(item.price*item.qty).toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div className="flex-shrink-0 p-4 border-t border-rose-50 bg-slate-50/50">
            <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notes / special requests..."
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all shadow-sm" />
          </div>

          {/* Totals + discount */}
          <div className="flex-shrink-0 p-5 bg-white border-t border-rose-50">
            <div className="flex justify-between text-xs font-normal text-slate-500 mb-2">
              <span>Subtotal</span>
              <span className="text-slate-800">₱{sub.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center mb-4">
              <button onClick={()=>setShowDisc(!showDisc)} className="text-[10px] font-normal uppercase tracking-widest text-[#FC687D] bg-rose-50 px-3 py-1.5 rounded-lg active:scale-95 transition-all border border-rose-100">
                Discount {disc>0?`(${disc}%)`:""} 🏷
              </button>
              {damt>0 && <span className="text-rose-500 text-xs font-normal">-₱{damt.toFixed(0)}</span>}
            </div>
            
            {showDisc && (
              <div className="flex gap-2 mb-4 animate-in fade-in slide-in-from-top-2">
                {[0,5,10,15,20].map(d=>(
                  <button key={d} onClick={()=>{setDisc(d);setShowDisc(false);}} 
                    className={`flex-1 py-2 rounded-lg text-[10px] font-normal transition-all active:scale-95 border ${
                      disc===d ? "bg-[#FC687D] text-white border-[#FC687D] shadow-sm" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                    }`}>
                    {d===0?"None":d+"%"}
                  </button>
                ))}
              </div>
            )}
            
            <div className="flex justify-between items-center border-t border-rose-50 pt-4 mt-2">
              <span className="font-normal text-lg text-slate-800 tracking-tight">TOTAL</span>
              <span className="font-normal text-2xl text-[#FC687D] tracking-tight">₱{total.toLocaleString()}</span>
            </div>
          </div>

          {/* Place Order */}
          <div className="flex-shrink-0 p-4 pt-0 bg-white pb-6">
            <button onClick={place} disabled={!cart.length||busy}
              className="w-full py-4 rounded-2xl font-normal text-xs uppercase tracking-widest text-white transition-all duration-300 active:scale-95 shadow-[0_8px_20px_rgba(252,104,125,0.25)] hover:shadow-[0_12px_25px_rgba(252,104,125,0.35)] hover:-translate-y-0.5 disabled:opacity-50 disabled:shadow-none disabled:translate-y-0"
              style={{ background: cart.length ? "linear-gradient(135deg,#FC687D,#f43f5e)" : "#cbd5e1" }}>
              {busy ? "Processing..." : cart.length ? `Charge ₱${total.toLocaleString()}` : "Select Items"}
            </button>
          </div>
        </div>
      </div>

      {/* RECEIPT MODAL */}
      {receipt && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="p-8 text-center border-b border-rose-50 bg-[#FFF9FA]">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 shadow-sm">
                ✓
              </div>
              <h2 className="font-normal text-2xl text-slate-800 tracking-tight mb-1">Order Placed!</h2>
              <p className="font-mono text-[10px] font-bold text-slate-400">#{receipt.id?.slice(-8).toUpperCase()}</p>
            </div>
            
            <div className="p-6 max-h-[40vh] overflow-y-auto hide-scrollbar">
              {receipt.cart.map(item=>(
                <div key={item.id} className="flex justify-between items-start mb-3 text-sm">
                  <span className="font-semibold text-slate-600 flex-1 pr-4">{item.name} <span className="text-slate-400 font-normal text-[10px] ml-1">x{item.qty}</span></span>
                  <span className="font-normal text-slate-800">₱{(item.price*item.qty).toLocaleString()}</span>
                </div>
              ))}
              
              <div className="border-t border-slate-100 pt-4 mt-4 space-y-2">
                {receipt.damt>0 && (
                  <div className="flex justify-between text-xs font-normal text-rose-400">
                    <span>Discount ({receipt.disc}%)</span>
                    <span>-₱{receipt.damt.toFixed(0)}</span>
                  </div>
                )}
                <div className="flex justify-between font-normal text-xl text-[#FC687D] pt-2">
                  <span>Total</span>
                  <span>₱{receipt.total.toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 mt-6 text-[11px] font-bold text-slate-500 border border-slate-100 space-y-1">
                <p className="flex justify-between"><span className="uppercase tracking-widest text-[9px] text-slate-400">Type</span> <span>{receipt.type}</span></p>
                {receipt.cname && <p className="flex justify-between"><span className="uppercase tracking-widest text-[9px] text-slate-400">Customer</span> <span>{receipt.cname}</span></p>}
                {receipt.table && <p className="flex justify-between"><span className="uppercase tracking-widest text-[9px] text-slate-400">Table</span> <span>{receipt.table}</span></p>}
              </div>
            </div>
            
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={()=>setReceipt(null)} className="flex-1 py-4 rounded-2xl border border-slate-200 bg-white font-normal text-slate-500 text-xs uppercase tracking-widest hover:bg-slate-50 active:scale-95 transition-all shadow-sm">
                New Order
              </button>
              <button onClick={()=>window.print()} className="flex-1 py-4 rounded-2xl border-none bg-[#FC687D] text-white font-normal text-xs uppercase tracking-widest shadow-[0_8px_20px_rgba(252,104,125,0.25)] hover:bg-rose-500 hover:-translate-y-0.5 active:scale-95 transition-all">
                Print
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}