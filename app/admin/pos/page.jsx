"use client";

import { useState, useEffect, useRef } from "react";
import { MenuItem, MenuCategory, Order } from "@/api/entities";
import { supabase } from "@/lib/supabase"; 
import { Html5Qrcode } from "html5-qrcode"; 

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
  
  const [orderType, setOrderType] = useState("TABLE"); 
  const [tableNum, setTableNum] = useState("");

  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef(null);

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

  // ─── UPGRADED CAMERA LOGIC (PERMISSIONS & REAR CAMERA) ───
  const startScanner = async () => {
    setIsScanning(true);
    
    try {
      // This forces the browser to ask the user for Camera Permission
      const devices = await Html5Qrcode.getCameras();
      
      if (devices && devices.length > 0) {
        // Find the back camera by checking the label
        let cameraId = devices[0].id; // Default to first camera if no specific labels
        for (const device of devices) {
          if (device.label.toLowerCase().includes("back") || device.label.toLowerCase().includes("rear") || device.label.toLowerCase().includes("environment")) {
            cameraId = device.id;
            break;
          }
        }

        const html5QrCode = new Html5Qrcode("reader");
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          cameraId,
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => { 
            handleBarcodeMatch(decodedText); 
            stopScanner(); 
          },
          () => {} // Ignore continuous scanning frame errors
        );
      } else {
        alert("No cameras found on this device.");
        setIsScanning(false);
      }
    } catch (err) {
      console.error("Camera access error:", err);
      alert("Camera permission denied. Please allow camera access in your browser settings to scan barcodes.");
      setIsScanning(false);
    }
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().then(() => setIsScanning(false)).catch(err => console.error(err));
    } else {
      setIsScanning(false);
    }
  };

  const handleBarcodeMatch = (code) => {
    const match = items.find(i => i.sku === code || i.barcode === code);
    if (match) add(match);
    else alert(`No item found in menu for barcode: ${code}`);
  };

  const filtered = items.filter(i => (cat==="ALL"||i.category===cat) && (!search||i.name.toLowerCase().includes(search.toLowerCase())));
  const getQty   = id => (cart.find(e=>e.id===id)||{}).qty || 0;
  const add = item => setCart(c => { const i=c.findIndex(e=>e.id===item.id); if(i>=0){const n=[...c];n[i]={...n[i],qty:n[i].qty+1};return n;} return [...c,{id:item.id,name:item.name,price:item.price,qty:1}]; });
  const upd = (id,d) => setCart(c => c.map(e=>e.id===id?{...e,qty:e.qty+d}:e).filter(e=>e.qty>0));
  const clear = () => { setCart([]); setCname(""); setCustSearch(""); setTableNum(""); setNotes(""); setDisc(0); setShowMobileTicket(false); setOrderType("TABLE"); };

  const sub  = cart.reduce((s,e)=>s+e.price*e.qty,0);
  const damt  = sub*disc/100;
  const total = sub-damt;

  const place = (isPaid = true, paymentMethod = "Unpaid") => {
    if(!cart.length||busy) return;
    setBusy(true);
    const np=[]; if(tableNum) np.push(`${orderType} #: ${tableNum}`); if(disc>0) np.push(`Disc:${disc}%`);
    Order.create({
      customer_name: cname || "Walk-in",
      items: cart.map(e=>({id:e.id,name:e.name,price:e.price,quantity:e.qty,subtotal:e.price*e.qty})),
      total_amount: total, status: isPaid ? "Confirmed" : "Open", payment_status: isPaid ? "Paid" : "Unpaid", order_type: orderType, notes: np.join(" | "),
    }).then(o => { 
      setReceipt({id: o.id, cart: [...cart], sub, damt, total, disc, isPaid, cname: cname || "Walk-in", type: orderType, method: paymentMethod }); 
      clear(); 
    }).finally(()=>setBusy(false));
  };

  if(loading) return <div className="h-screen w-full flex items-center justify-center bg-white"><div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full"></div></div>;

  return (
    <div className="h-[100dvh] lg:h-full w-full flex flex-col lg:flex-row overflow-hidden bg-white lg:rounded-2xl lg:border border-slate-200/60 shadow-sm relative">
      
      {/* ─── LEFT: MENU SECTION ─── */}
      <div className="flex-1 flex flex-col min-w-0 bg-white h-full lg:border-r border-slate-100">
        
        {/* Header - Fixed at top */}
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

        {/* Scrollable List Area */}
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

      {/* ─── FIXED MOBILE BUTTON ─── */}
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
          <h2 className="font-normal text-base text-slate-800 flex items-center gap-2">Ticket <span className="bg-slate-100 text-slate-400 rounded px-1.5 py-0.5 text-[10px]">{cart.length}</span></h2>
          <button onClick={() => setShowMobileTicket(false)} className="lg:hidden p-1 text-slate-400 text-sm font-bold">✕ Close</button>
        </div>

        <div className="flex-shrink-0 p-3 bg-white space-y-2 border-b border-slate-100">
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus-within:border-[#FC687D] transition-colors">
            <button onClick={isScanning ? stopScanner : startScanner} className={`text-base leading-none ${isScanning ? 'text-red-500 animate-pulse' : 'text-slate-400'}`}>║▌</button>
            <input value={custSearch} onChange={e=>setCustSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleBarcodeMatch(custSearch)} placeholder="Scan Barcode or Search..." className="flex-1 bg-transparent text-[11px] font-normal focus:outline-none" />
          </div>

          {/* Camera Preview Box */}
          {isScanning && (
            <div className="relative w-full rounded-lg overflow-hidden border-2 border-emerald-400 bg-black aspect-video shadow-inner flex items-center justify-center">
              <div id="reader" className="w-full"></div>
              {/* Overlay targeting box to help cashiers aim */}
              <div className="absolute inset-0 pointer-events-none border-[40px] border-black/30 flex items-center justify-center">
                 <div className="w-full h-full border-2 border-emerald-400/50"></div>
              </div>
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
              <button onClick={() => place(false, "Unpaid")} disabled={!cart.length} className="py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-100 active:scale-95 disabled:opacity-30 transition-all">SAVE</button>
              <button onClick={()=>setShowPaymentModal(true)} disabled={!cart.length} className={`py-3 rounded-xl font-black transition-all active:scale-95 text-white flex flex-col items-center justify-center leading-tight shadow-md ${cart.length ? "bg-emerald-500" : "bg-slate-300 shadow-none"}`}>
                <span className="text-[8px] uppercase tracking-widest opacity-80">Charge</span>
                <span className="text-sm">₱{total.toLocaleString()}</span>
              </button>
           </div>
        </div>
      </div>
      
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