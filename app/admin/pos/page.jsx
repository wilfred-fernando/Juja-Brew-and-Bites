"use client";

import { useState, useEffect, useRef } from "react";
import { MenuItem, MenuCategory, Order } from "@/api/entities";
import { supabase } from "@/lib/supabase"; 
import { Html5Qrcode } from "html5-qrcode"; 

// --- FORMATTING HELPERS ---
const formatLoyaltyDate = (dateStr, includeTime = false) => {
  if (!dateStr || dateStr === "N/A") return "N/A";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr; 
  const datePart = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  if (includeTime) return `${datePart} at ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  return datePart;
};

const formatLoyaltyMoney = (val) => {
  const num = parseFloat(val);
  return isNaN(num) ? "0.00" : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

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
  const [showCustList, setShowCustList] = useState(false);
  const [cname, setCname] = useState("");
  const [customerProfile, setCustomerProfile] = useState(null);

  const [orderType, setOrderType] = useState("TABLE"); 
  const [tableNum, setTableNum] = useState("");

  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef(null);

  const [currentOrderId, setCurrentOrderId] = useState(null);
  const [openTickets, setOpenTickets] = useState([]);
  const [showOpenTickets, setShowOpenTickets] = useState(false);
  const [openTicketsFilter, setOpenTicketsFilter] = useState("TABLE");

  useEffect(() => {
    Promise.all([MenuItem.list(), MenuCategory.list()])
      .then(([mi, mc]) => {
        setCats((mc||[]).filter(c=>c.is_active!==false).sort((a,b)=>(a.sort_order||99)-(b.sort_order||99)));
        setItems((mi||[]).filter(i=>i.is_available!==false));
      })
      .catch(()=>{})
      .finally(()=>setLoading(false));

    supabase.from("loyalty_members").select("*").then(({ data }) => { if (data) setMembers(data); });
  }, []);

  const startScanner = async () => {
    setIsScanning(true);
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        let cameraId = devices[0].id; 
        for (const device of devices) {
          if (device.label.toLowerCase().includes("back") || device.label.toLowerCase().includes("rear") || device.label.toLowerCase().includes("environment")) {
            cameraId = device.id; break;
          }
        }
        const html5QrCode = new Html5Qrcode("reader");
        scannerRef.current = html5QrCode;
        await html5QrCode.start(cameraId, { fps: 10, qrbox: { width: 250, height: 150 } }, (decodedText) => { handleBarcodeMatch(decodedText); stopScanner(); }, () => {});
      } else { alert("No cameras found."); setIsScanning(false); }
    } catch (err) { alert("Camera permission denied."); setIsScanning(false); }
  };

  const stopScanner = () => {
    if (scannerRef.current) scannerRef.current.stop().then(() => setIsScanning(false)).catch(e => console.error(e));
    else setIsScanning(false);
  };

  const handleBarcodeMatch = (rawCode) => {
    const code = rawCode.trim();
    const memberMatch = members.find(m => m["Customer code"] === code);
    if (memberMatch) { setCname(memberMatch["Customer name"]); setCustSearch(memberMatch["Customer name"]); setCustomerProfile(memberMatch); return; }
    const itemMatch = items.find(i => i.sku === code || i.barcode === code);
    if (itemMatch) { add(itemMatch); setCustSearch(""); return; }
    alert(`No match found for: ${code}`);
  };

  const filtered = items.filter(i => (cat==="ALL"||i.category===cat) && (!search||i.name.toLowerCase().includes(search.toLowerCase())));
  const getQty   = id => (cart.find(e=>e.id===id)||{}).qty || 0;
  const add = item => setCart(c => { const i=c.findIndex(e=>e.id===item.id); if(i>=0){const n=[...c];n[i]={...n[i],qty:n[i].qty+1};return n;} return [...c,{id:item.id,name:item.name,price:item.price,qty:1}]; });
  const upd = (id,d) => setCart(c => c.map(e=>e.id===id?{...e,qty:e.qty+d}:e).filter(e=>e.qty>0));
  
  const clear = () => { 
    setCart([]); setCname(""); setCustSearch(""); setTableNum(""); setNotes(""); setDisc(0); 
    setShowMobileTicket(false); setShowPaymentModal(false); setOrderType("TABLE"); setCurrentOrderId(null); 
  };

  const sub  = cart.reduce((s,e)=>s+e.price*e.qty,0);
  const damt  = sub*disc/100;
  const total = sub-damt;

  const fetchOpenTickets = async () => {
    try {
      const { data } = await supabase.from('orders').select('*').eq('status', 'Open').order('created_at', { ascending: false });
      if (data) setOpenTickets(data);
      setShowOpenTickets(true);
    } catch (err) { console.error(err); }
  };

  const loadTicket = (ticket) => {
    setCurrentOrderId(ticket.id);
    let parsedItems = ticket.items;
    if (typeof parsedItems === 'string') { try { parsedItems = JSON.parse(parsedItems); } catch(e) { parsedItems = []; } }
    if (Array.isArray(parsedItems)) setCart(parsedItems.map(i => ({id: i.id, name: i.name, price: i.price, qty: i.quantity})));
    else setCart([]);

    setCname(ticket.customer_name === "Walk-in" ? "" : ticket.customer_name);
    setCustSearch(ticket.customer_name === "Walk-in" ? "" : ticket.customer_name);
    setOrderType(ticket.order_type || "TABLE");
    
    let tNum = "";
    if (ticket.notes) {
      const match = ticket.notes.match(/#: (.*?)( \||$)/);
      if (match) tNum = match[1];
      const discMatch = ticket.notes.match(/Disc:(.*?)%/);
      if (discMatch) setDisc(parseFloat(discMatch[1])); else setDisc(0);
    }
    setTableNum(tNum);
    setShowOpenTickets(false);
  };

  // ─── STABILIZED SAVE/UPDATE LOGIC ───
  const place = async (isPaid = true, paymentMethod = "Unpaid") => {
    if(!cart.length || busy) return;
    setBusy(true);
    
    const np = []; 
    if(tableNum) np.push(`${orderType} #: ${tableNum}`); 
    if(disc>0) np.push(`Disc:${disc}%`);
    
    // Safely mapping items and including empty fields some APIs require
    const payload = {
      customer_name: cname || "Walk-in",
      customer_email: "",
      customer_phone: "",
      items: cart.map(e => ({ id: e.id, name: e.name, price: e.price, quantity: e.qty, subtotal: e.price * e.qty })),
      total_amount: total, 
      status: isPaid ? "Confirmed" : "Open", 
      payment_status: isPaid ? "Paid" : "Unpaid", 
      order_type: orderType, 
      notes: np.join(" | ")
    };

    try {
      let orderId = currentOrderId;

      if (currentOrderId) {
        // Direct Supabase Update
        const { error } = await supabase.from('orders').update(payload).eq('id', currentOrderId);
        
        if (error) {
           // Fallback: If DB strictly requires items to be a stringified JSON array
           const { error: retryError } = await supabase
              .from('orders')
              .update({ ...payload, items: JSON.stringify(payload.items) })
              .eq('id', currentOrderId);
           if (retryError) throw retryError;
        }
      } else {
        // Create New Ticket
        const o = await Order.create(payload);
        orderId = o.id;
      }
      
      setReceipt({
        id: orderId, cart: [...cart], sub, damt, total, disc, isPaid, 
        cname: cname || "Walk-in", type: orderType, method: paymentMethod 
      }); 
      
      clear(); 
    } catch (e) {
      console.error("Save Error:", e);
      // Alerts the exact error message so we know exactly what failed
      alert(`Failed to save: ${e.message || JSON.stringify(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-[100dvh] lg:h-full w-full flex flex-col lg:flex-row overflow-hidden bg-white lg:rounded-2xl lg:border border-slate-200/60 shadow-sm relative">
      
      {/* ─── LEFT: MENU SECTION ─── */}
      <div className="flex-1 flex flex-col min-w-0 bg-white h-full lg:border-r border-slate-100">
        <div className="flex-shrink-0 px-4 py-3 border-b border-slate-50 flex items-center justify-between bg-white pt-safe z-10">
          <select value={cat} onChange={e=>setCat(e.target.value)} className="bg-transparent font-normal text-slate-800 text-base focus:outline-none cursor-pointer">
            <option value="ALL">All Items</option>
            {cats.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <div className="relative w-40 md:w-64">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto hide-scrollbar p-2 pb-24 lg:pb-2">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
            {filtered.map(item => {
              const qty = getQty(item.id);
              return (
                <button key={item.id} onClick={()=>add(item)} className="flex items-center p-3 rounded-xl border border-slate-100 hover:bg-slate-50 text-left transition-all relative">
                  <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center mr-3 flex-shrink-0 overflow-hidden border border-slate-100">
                    {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover" /> : <span className="opacity-20 text-lg">📷</span>}
                    {qty>0 && <div className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-[#FC687D] text-white text-[10px] font-black flex items-center justify-center shadow-sm">{qty}</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-800 font-normal text-sm truncate">{item.name}</p>
                    <p className="text-slate-400 text-[10px] uppercase tracking-widest">{item.category}</p>
                  </div>
                  <div className="font-normal text-slate-800 text-sm ml-2">₱{item.price}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="lg:hidden fixed bottom-0 left-0 right-0 p-3 bg-white/90 backdrop-blur-md border-t border-slate-200 z-40 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] pb-safe">
        <button onClick={() => setShowMobileTicket(true)} 
          className={`w-full py-4 rounded-xl font-black text-sm text-white flex items-center justify-between px-6 transition-all shadow-lg active:scale-95 ${cart.length ? "bg-emerald-500" : "bg-slate-400"}`}>
          <span>{cart.length} Items</span>
          <span>View Ticket ➔</span>
        </button>
      </div>

      {/* ─── RIGHT: TICKET SECTION ─── */}
      <div className={`fixed inset-0 z-50 lg:static lg:z-auto w-full lg:w-[320px] xl:w-[360px] flex flex-col bg-slate-50/50 transition-transform duration-300 ${showMobileTicket ? "translate-y-0" : "translate-y-full lg:translate-y-0"}`}>
        
        <div className="flex-shrink-0 px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between pt-safe">
          <h2 className="font-normal text-base text-slate-800 flex items-center gap-2">
            {currentOrderId ? "Open Ticket" : "Ticket"}
            <span className="bg-slate-100 text-slate-400 rounded px-1.5 py-0.5 text-[10px]">{cart.length}</span>
          </h2>
          <div className="flex items-center gap-2">
            {cart.length > 0 && <button onClick={clear} className="text-slate-400 hover:text-red-500 text-sm mr-1">🗑️</button>}
            <button onClick={fetchOpenTickets} className="flex items-center gap-1 text-[9px] xl:text-[10px] uppercase tracking-widest font-normal text-slate-500 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors">
              📋 Open Tickets
            </button>
            <button onClick={() => setShowMobileTicket(false)} className="lg:hidden p-1 text-slate-400 text-sm font-bold">✕</button>
          </div>
        </div>

        <div className="flex-shrink-0 p-3 bg-white space-y-2 border-b border-slate-100">
          <div className="relative">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus-within:border-[#FC687D] transition-colors">
              <button onClick={isScanning ? stopScanner : startScanner} className={`text-base leading-none ${isScanning ? 'text-red-500 animate-pulse' : 'text-slate-400'}`}>║▌</button>
              <input value={custSearch} onChange={e=>setCustSearch(e.target.value)} onFocus={() => setShowCustList(true)} onBlur={() => setTimeout(() => setShowCustList(false), 200)} onKeyDown={e=>{if(e.key==='Enter') {handleBarcodeMatch(custSearch); e.preventDefault();}}} placeholder="Scan Loyalty or Item..." className="flex-1 bg-transparent text-[11px] font-normal focus:outline-none" />
            </div>
            {showCustList && custSearch && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 shadow-xl rounded-lg max-h-48 overflow-y-auto hide-scrollbar z-50">
                {members.filter(m => (m["Customer name"] || "").toLowerCase().includes(custSearch.toLowerCase()) || (m["Phone"] || "").includes(custSearch)).length > 0 ? 
                  members.filter(m => (m["Customer name"] || "").toLowerCase().includes(custSearch.toLowerCase()) || (m["Phone"] || "").includes(custSearch)).map(m => (
                  <button key={m.id} onMouseDown={() => { setCustSearch(m["Customer name"]); setCname(m["Customer name"]); setShowCustList(false); setCustomerProfile(m); }} className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-50 transition-colors">
                    <p className="font-normal text-slate-800 text-xs leading-tight">{m["Customer name"]}</p>
                  </button>
                )) : (<div className="px-3 py-2 text-[10px] text-slate-400 bg-slate-50 italic">Walk-In: "{custSearch}"</div>)}
              </div>
            )}
          </div>

          {isScanning && (
            <div className="relative w-full rounded-lg overflow-hidden border-2 border-emerald-400 bg-black aspect-video shadow-inner flex items-center justify-center">
              <div id="reader" className="w-full"></div>
              <div className="absolute inset-0 pointer-events-none border-[40px] border-black/30 flex items-center justify-center"><div className="w-full h-full border-2 border-emerald-400/50"></div></div>
            </div>
          )}

          <div className="flex gap-1.5">
            <select value={orderType} onChange={e=>setOrderType(e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-[10px] font-normal text-slate-500 uppercase focus:outline-none">
              <option value="TABLE">TABLE</option>
              <option value="TAKEOUT">TAKEOUT</option>
              <option value="GRAB | PANDA">GRAB | PANDA</option>
              <option value="VIP ROOM">VIP ROOM</option>
            </select>
            <input value={tableNum} onChange={e=>setTableNum(e.target.value)} placeholder="#" className="w-12 bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs font-normal text-center focus:outline-none" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto hide-scrollbar">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full opacity-20 py-10">
              <span className="text-4xl mb-2">🧾</span>
              <p className="font-normal text-[9px] uppercase tracking-widest text-slate-400">Ticket is empty</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 px-1">
              {cart.map(item => (
                <div key={item.id} className="p-3 flex justify-between items-center hover:bg-white/40 transition-colors">
                  <div className="flex-1 pr-3">
                    <p className="font-normal text-slate-800 text-xs truncate">{item.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                       <button onClick={()=>upd(item.id,-1)} className="w-5 h-5 rounded bg-white border border-slate-100 flex items-center justify-center text-xs text-slate-400">-</button>
                       <span className="text-xs font-black text-slate-700">{item.qty}</span>
                       <button onClick={()=>upd(item.id,1)} className="w-5 h-5 rounded bg-white border border-slate-100 flex items-center justify-center text-xs text-slate-400">+</button>
                    </div>
                  </div>
                  <span className="text-xs font-normal text-slate-800">₱{(item.price*item.qty).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 bg-white border-t border-slate-200">
           <button onClick={()=>setShowDisc(!showDisc)} className="w-full px-4 py-2.5 flex justify-between items-center hover:bg-slate-50 border-b border-slate-50">
              <span className="text-[10px] font-normal uppercase tracking-widest text-slate-400">Discount</span>
              <span className="text-[10px] font-normal text-[#FC687D]">Add &gt;</span>
           </button>
           
           <div className="p-3 grid grid-cols-2 gap-2 pb-safe">
              <button onClick={() => place(false, "Unpaid")} disabled={!cart.length} className={`py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-30 ${currentOrderId ? 'text-amber-600 bg-amber-50 border border-amber-100' : 'text-emerald-600 bg-emerald-50 border border-emerald-100'}`}>
                {currentOrderId ? 'UPDATE TICKET' : 'SAVE'}
              </button>
              <button onClick={()=>setShowPaymentModal(true)} disabled={!cart.length} className={`py-3 rounded-xl font-black transition-all active:scale-95 text-white flex flex-col items-center justify-center leading-tight shadow-md ${cart.length ? "bg-emerald-500" : "bg-slate-300 shadow-none"}`}>
                <span className="text-[8px] uppercase tracking-widest opacity-80">Charge</span>
                <span className="text-sm">₱{total.toLocaleString()}</span>
              </button>
           </div>
        </div>
      </div>

      {/* ─── OPEN TICKETS MODAL ─── */}
      {showOpenTickets && (
        <div className="fixed inset-0 z-[500] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl flex flex-col max-h-[80vh] overflow-hidden shadow-2xl relative animate-in zoom-in duration-200">
             <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
               <h2 className="text-lg font-normal text-slate-800 flex items-center gap-2">📋 Open Tickets</h2>
               <button onClick={()=>setShowOpenTickets(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
             </div>
             <div className="px-6 pt-4 pb-2 flex gap-2 overflow-x-auto hide-scrollbar border-b border-slate-100">
               {["TABLE", "VIP ROOM", "TAKEOUT", "GRAB | PANDA"].map(t => (
                  <button key={t} onClick={()=>setOpenTicketsFilter(t)} className={`px-4 py-2 rounded-full text-[10px] font-normal uppercase tracking-widest whitespace-nowrap transition-colors ${openTicketsFilter === t ? 'bg-[#FC687D] text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {t}
                  </button>
               ))}
             </div>
             <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                {openTickets.filter(t => t.order_type === openTicketsFilter).length === 0 ? (
                  <div className="text-center py-12 opacity-50">
                    <span className="text-4xl">📭</span>
                    <p className="mt-3 text-[10px] font-normal uppercase tracking-widest text-slate-500">No open tickets here</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {openTickets.filter(t => t.order_type === openTicketsFilter).map(ticket => (
                      <button key={ticket.id} onClick={() => loadTicket(ticket)} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-[#FC687D]/30 transition-all text-left flex flex-col gap-2 group relative overflow-hidden">
                         <div className="flex justify-between items-start">
                           <span className="font-normal text-sm text-slate-800">{ticket.customer_name}</span>
                           <span className="text-[10px] font-normal uppercase tracking-widest text-emerald-500 bg-emerald-50 px-2 py-1 rounded-md">₱{parseFloat(ticket.total_amount || 0).toLocaleString()}</span>
                         </div>
                         <p className="text-[11px] text-slate-400 font-normal line-clamp-1">{ticket.notes || "No notes"}</p>
                         <p className="text-[9px] text-slate-300 font-mono mt-1">{new Date(ticket.created_at).toLocaleTimeString()}</p>
                         <div className="absolute inset-0 bg-[#FC687D]/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      </button>
                    ))}
                  </div>
                )}
             </div>
          </div>
        </div>
      )}
      
      {/* ─── LOYALTY PROFILE MODAL ─── */}
      {customerProfile && (
        <div className="fixed inset-0 z-[400] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 animate-in zoom-in duration-300 shadow-2xl relative">
             <button onClick={()=>setCustomerProfile(null)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 text-xl">✕</button>
             <h2 className="text-3xl font-normal text-slate-800 text-center mb-8 mt-2">{customerProfile["Customer name"]}</h2>
             <div className="space-y-5 mb-8 px-2">
                <div className="flex items-center gap-5 text-slate-500">
                   <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                   <span className="font-normal text-sm text-slate-700">{customerProfile["Phone"] || "N/A"}</span>
                </div>
                <div className="flex items-center gap-5 text-slate-500">
                   <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                   <span className="font-normal text-sm text-slate-700">{customerProfile["City"] || customerProfile["Address"] || "Quezon City"}</span>
                </div>
                <div className="flex items-center gap-5 text-slate-500">
                   <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4h2v16H4V4zm4 0h1v16H8V4zm3 0h3v16h-3V4zm5 0h1v16h-1V4zm3 0h1v16h-1V4z"></path></svg>
                   <span className="font-normal text-sm text-slate-700">{customerProfile["Customer code"] || "N/A"}</span>
                </div>
                <div className="flex items-center gap-5 text-slate-500">
                   <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
                   <span className="font-normal text-sm text-slate-700">{customerProfile["Birthday"] || "N/A"}</span>
                </div>
             </div>
             <div className="border-t border-slate-100 my-6"></div>
             <div className="grid grid-cols-2 gap-y-7 gap-x-4 px-2">
                <div className="flex items-start gap-4 text-slate-500">
                   <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="mt-0.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                   <div>
                      <p className="text-slate-800 font-normal text-sm leading-tight">{formatLoyaltyDate(customerProfile["Last visit"] || customerProfile.last_visit, true)}</p>
                      <p className="text-[11px] text-slate-400 font-normal mt-1">Last visit</p>
                   </div>
                </div>
                <div className="flex items-start gap-4 text-slate-500">
                   <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="mt-0.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
                   <div>
                      <p className="text-slate-800 font-normal text-sm leading-none">{customerProfile["Total visits"] || customerProfile["Visits"] || customerProfile.total_visits || "0"}</p>
                      <p className="text-[11px] text-slate-400 font-normal mt-1">Visits</p>
                   </div>
                </div>
                <div className="flex items-start gap-4 text-slate-500">
                   <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="mt-0.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                   <div>
                      <p className="text-slate-800 font-normal text-sm leading-none">₱{formatLoyaltyMoney(customerProfile["Total spent"] || customerProfile.total_spent)}</p>
                      <p className="text-[11px] text-slate-400 font-normal mt-1">Total spent</p>
                   </div>
                </div>
                <div className="flex items-start gap-4 text-slate-500">
                   <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="mt-0.5"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg>
                   <div>
                      <p className="text-slate-800 font-normal text-sm leading-none">{formatLoyaltyMoney(customerProfile["Points balance"] || customerProfile["Points"] || customerProfile.points_balance)}</p>
                      <p className="text-[11px] text-slate-400 font-normal mt-1">Points</p>
                   </div>
                </div>
             </div>
             <div className="mt-8">
                <button onClick={()=>setCustomerProfile(null)} className="w-full py-4 rounded-[14px] font-normal text-sm text-white bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all shadow-md uppercase tracking-widest">
                   Assign to Ticket
                </button>
             </div>
          </div>
        </div>
      )}

      {/* ─── PAYMENT & MODALS ─── */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex flex-col pt-10 pb-safe px-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm xl:max-w-md mx-auto bg-[#1a1a1a] rounded-3xl overflow-hidden flex flex-col border border-slate-800">
             <div className="p-4 border-b border-slate-800 text-center relative">
                <button onClick={()=>setShowPaymentModal(false)} className="absolute left-4 text-white text-xl">✕</button>
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Payment</span>
             </div>
             <div className="py-8 text-center text-white border-b border-slate-800">
                <h1 className="text-3xl font-normal tracking-tight">₱{total.toLocaleString()}</h1>
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
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 text-center animate-in zoom-in duration-300 shadow-2xl">
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