"use client";

import { useState, useEffect } from "react";
import { MenuItem, MenuCategory, Order } from "@/api/entities";
import { supabase } from "@/lib/supabase"; 

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

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
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [amountTendered, setAmountTendered] = useState("");

  const [members, setMembers] = useState([]);
  const [custSearch, setCustSearch] = useState("");
  const [cname, setCname] = useState("");
  const [showCustList, setShowCustList] = useState(false);

  const [orderType, setOrderType] = useState("TABLE"); 
  const [tableNum, setTableNum] = useState("");

  useEffect(() => {
    Promise.all([MenuItem.list(), MenuCategory.list()])
      .then(([mi, mc]) => {
        setCats((mc||[]).filter(c=>c.is_active!==false).sort((a,b)=>(a.sort_order||99)-(b.sort_order||99)));
        setItems((mi||[]).filter(i=>i.is_available!==false));
      })
      .catch(()=>{})
      .finally(()=>setLoading(false));

    supabase.from("loyalty_members").select("*")
      .then(({ data }) => { if (data) setMembers(data); });
  }, []);

  const filtered = items.filter(i => (cat==="ALL"||i.category===cat) && (!search||i.name.toLowerCase().includes(search.toLowerCase())));
  const getQty   = id => (cart.find(e=>e.id===id)||{}).qty || 0;

  const add = item => setCart(c => { const i=c.findIndex(e=>e.id===item.id); if(i>=0){const n=[...c];n[i]={...n[i],qty:n[i].qty+1};return n;} return [...c,{id:item.id,name:item.name,price:item.price,qty:1}]; });
  const upd = (id,d) => setCart(c => c.map(e=>e.id===id?{...e,qty:e.qty+d}:e).filter(e=>e.qty>0));
  
  const clear = () => { 
    setCart([]); setCname(""); setCustSearch(""); setTableNum(""); setNotes(""); setDisc(0); 
    setShowMobileTicket(false); setShowPaymentModal(false); setAmountTendered(""); setOrderType("TABLE");
  };

  const sub  = cart.reduce((s,e)=>s+e.price*e.qty,0);
  const damt  = sub*disc/100;
  const total = sub-damt;

  const handleChargeClick = () => {
    if(!cart.length) return;
    setAmountTendered(total.toString());
    setShowPaymentModal(true);
  };

  const place = (isPaid = true, paymentMethod = "Unpaid") => {
    if(!cart.length||busy) return;
    setBusy(true);
    const np=[]; 
    if(tableNum && (orderType === "VIP ROOM" || orderType === "TABLE")) np.push(`${orderType} #: ${tableNum}`);
    if(disc>0) np.push("Disc:"+disc+"%"); 
    if(paymentMethod !== "Unpaid") np.push(`Paid via: ${paymentMethod}`);
    if(notes) np.push(notes);

    Order.create({
      customer_name: cname || "Walk-in",
      customer_email:"", customer_phone:"",
      items: cart.map(e=>({id:e.id,name:e.name,price:e.price,quantity:e.qty,subtotal:e.price*e.qty})),
      total_amount: total, 
      status: isPaid ? "Confirmed" : "Open",
      payment_status: isPaid ? "Paid" : "Unpaid",
      order_type: orderType, 
      notes: np.join(" | "),
    })
    .then(o => { 
      setReceipt({
        id: o.id, cart: [...cart], sub, damt, total, disc, isPaid,
        cname: cname || "Walk-in", type: orderType, method: paymentMethod,
        table: tableNum ? `${orderType} ${tableNum}` : orderType,
        change: paymentMethod === "CASH" ? (parseFloat(amountTendered || 0) - total) : 0
      }); 
      clear(); 
    })
    .catch(()=>alert("Order failed. Try again."))
    .finally(()=>setBusy(false));
  };

  const filteredMembers = members.filter(m => 
    (m["Customer name"] || "").toLowerCase().includes(custSearch.toLowerCase()) ||
    (m["Phone"] || "").includes(custSearch)
  );

  if(loading) return <div className="h-full w-full flex items-center justify-center bg-[#FFF5F7]"><div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full"></div></div>;

  return (
    <div className="h-full w-full flex flex-col lg:flex-row overflow-hidden bg-white animate-in fade-in duration-500 rounded-2xl lg:border border-slate-200/60">
      
      {/* ─── LEFT: MENU LIST ─── */}
      <div className="flex-1 flex flex-col min-w-0 bg-white relative h-full">
        <div className="px-4 py-4 border-b border-slate-100 flex items-center justify-between">
          <select value={cat} onChange={e=>setCat(e.target.value)} className="bg-transparent font-normal text-slate-800 text-lg focus:outline-none cursor-pointer">
            <option value="ALL">All items</option>
            {cats.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <div className="relative w-48 md:w-64">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search menu..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#FC687D]" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto hide-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-none md:gap-3 p-3">
            {filtered.map(item=>{
              const qty = getQty(item.id);
              return (
                <button key={item.id} onClick={()=>add(item)} className="flex items-center p-3 md:rounded-xl md:border md:border-slate-100 hover:bg-slate-50 text-left w-full transition-all group">
                  <div className="w-12 h-12 md:w-14 md:h-14 bg-slate-50 rounded-lg flex items-center justify-center mr-4 relative flex-shrink-0">
                    {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover rounded-lg" /> : <span className="opacity-30">📷</span>}
                    {qty>0 && <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-[#FC687D] flex items-center justify-center text-xs font-black text-white shadow-sm animate-in zoom-in">{qty}</div>}
                  </div>
                  <div className="flex-1 truncate">
                    <p className="text-slate-800 font-normal text-sm md:text-base truncate">{item.name}</p>
                    <p className="text-slate-400 text-[10px] md:text-xs font-normal uppercase tracking-widest">{item.category}</p>
                  </div>
                  <div className="font-normal text-slate-800 ml-4">₱{item.price}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:hidden p-3 bg-white border-t"><button onClick={()=>setShowMobileTicket(true)} className={`w-full py-3.5 rounded-xl font-black text-sm text-white flex items-center justify-between px-5 ${cart.length ? "bg-slate-800" : "bg-slate-300"}`}><span>{cart.length} Items</span><span>View Ticket ➔</span></button></div>
      </div>

      {/* ─── RIGHT: TICKET ─── */}
      <div className={`fixed inset-0 z-50 lg:static lg:z-auto w-full lg:w-[320px] xl:w-[380px] flex-shrink-0 flex flex-col bg-slate-50/50 lg:border-l border-slate-200 transition-transform duration-300 ${showMobileTicket ? "translate-y-0" : "translate-y-full lg:translate-y-0"}`}>
        
        <div className="flex-shrink-0 px-4 py-4 bg-white border-b border-slate-200 flex items-center justify-between pt-safe">
          <h2 className="font-normal text-lg text-slate-800 flex items-center gap-2">Ticket <span className="bg-slate-100 text-slate-500 rounded px-2 py-0.5 text-xs">{cart.length}</span></h2>
          <div className="flex gap-4">
             <button onClick={() => setShowCustList(!showCustList)} className="text-slate-400 hover:text-slate-600">👤</button>
             <button className="text-slate-400">⋮</button>
          </div>
        </div>

        <div className="flex-shrink-0 p-3 bg-white space-y-2">
          {/* Barcode Search Bar */}
          <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-slate-400 text-lg leading-none">║▌</span>
            <input value={custSearch} onChange={e=>setCustSearch(e.target.value)} placeholder="Scan Barcode or Search..." className="flex-1 bg-transparent text-xs font-normal focus:outline-none" />
          </div>

          {/* Table Selector Row */}
          <div className="flex gap-2">
            <select value={orderType} onChange={e=>setOrderType(e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-normal text-slate-500 uppercase tracking-widest focus:outline-none">
              <option value="TABLE">TABLE</option>
              <option value="TAKEOUT">TAKEOUT</option>
              <option value="GRAB | PANDA">GRAB | PANDA</option>
              <option value="VIP ROOM">VIP ROOM</option>
            </select>
            <input value={tableNum} onChange={e=>setTableNum(e.target.value)} placeholder="#" className="w-16 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-normal text-center focus:outline-none" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto hide-scrollbar">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full opacity-20 grayscale">
              <span className="text-5xl mb-4">🧾</span>
              <p className="font-normal text-[10px] uppercase tracking-[0.2em]">Ticket is empty</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {cart.map(item => (
                <div key={item.id} className="p-4 bg-white/50 flex justify-between items-start">
                  <div className="flex-1 pr-4">
                    <p className="font-normal text-slate-800 text-xs leading-tight mb-1">{item.name}</p>
                    <div className="flex items-center gap-2">
                       <button onClick={()=>upd(item.id,-1)} className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-xs text-slate-500">-</button>
                       <span className="text-xs font-black text-slate-800">{item.qty}</span>
                       <button onClick={()=>upd(item.id,1)} className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-xs text-slate-500">+</button>
                    </div>
                  </div>
                  <span className="text-xs font-normal text-slate-800 whitespace-nowrap">₱{(item.price*item.qty).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 bg-white border-t border-slate-200">
           <button onClick={()=>setShowDisc(!showDisc)} className="w-full px-4 py-3 flex justify-between items-center hover:bg-slate-50 transition-colors border-b border-slate-100">
              <span className="text-[10px] font-normal uppercase tracking-widest text-slate-400">Discount</span>
              <span className="text-[11px] font-normal text-red-500">Add &gt;</span>
           </button>
           
           <div className="p-3 grid grid-cols-2 gap-2 pb-safe">
              <button onClick={() => place(false, "Unpaid")} disabled={!cart.length} 
                className="py-4 rounded-lg font-black text-xs uppercase tracking-widest text-[#1EBBA3] bg-[#1EBBA3]/10 border border-[#1EBBA3]/20 transition-all active:scale-95 disabled:opacity-30">
                SAVE
              </button>
              <button onClick={handleChargeClick} disabled={!cart.length}
                className={`py-4 rounded-lg font-black transition-all active:scale-95 text-white shadow-lg flex flex-col items-center justify-center leading-none ${cart.length ? "bg-[#1EBBA3]" : "bg-slate-300 shadow-none"}`}>
                <span className="text-[9px] uppercase tracking-widest opacity-80 mb-1">Charge</span>
                <span className="text-base">₱{total.toLocaleString()}</span>
              </button>
           </div>
        </div>
      </div>

      {/* ─── PAYMENT & MODALS ─── */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex flex-col pt-10 px-4 pb-safe animate-in fade-in duration-200">
          <div className="w-full max-w-md mx-auto bg-[#1a1a1a] rounded-3xl overflow-hidden flex flex-col border border-slate-800">
             <div className="p-4 border-b border-slate-800 text-center relative">
                <button onClick={()=>setShowPaymentModal(false)} className="absolute left-4 text-white text-xl">✕</button>
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Payment</span>
             </div>
             <div className="py-8 text-center text-white border-b border-slate-800">
                <h1 className="text-3xl font-normal tracking-tight">₱{total.toLocaleString()}</h1>
                <p className="text-xs text-slate-500 mt-1">Total amount due</p>
             </div>
             <div className="p-6 grid grid-cols-1 gap-2 overflow-y-auto max-h-[400px] hide-scrollbar">
                {["CASH", "GRABFOOD", "QRPH", "GRAB DINE OUT", "CARD"].map(pm => (
                   <button key={pm} onClick={()=>{setShowPaymentModal(false); place(true, pm);}} className="w-full py-4 bg-[#2a2a2a] rounded-xl text-white font-normal text-xs uppercase tracking-widest hover:bg-[#333] transition-colors">{pm}</button>
                ))}
             </div>
          </div>
        </div>
      )}

      {receipt && (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 text-center animate-in zoom-in duration-300">
             <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">✓</div>
             <h2 className="text-xl font-normal text-slate-800">{receipt.isPaid ? "Payment Received" : "Ticket Saved"}</h2>
             <p className="text-xs text-slate-400 font-mono mt-1 uppercase">#{receipt.id?.slice(-8)}</p>
             <div className="mt-6 space-y-3">
                <button onClick={()=>window.print()} className="w-full py-3.5 bg-slate-50 text-slate-600 font-normal text-xs rounded-xl uppercase tracking-widest">Print Receipt</button>
                <button onClick={()=>setReceipt(null)} className="w-full py-3.5 bg-[#FC687D] text-white font-normal text-xs rounded-xl uppercase tracking-widest shadow-lg shadow-rose-200">New Order</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}