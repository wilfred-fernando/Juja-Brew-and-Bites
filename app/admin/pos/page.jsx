"use client";

import { useState, useEffect, useRef } from "react";
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
  
  // UI States
  const [showMobileTicket, setShowMobileTicket] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [amountTendered, setAmountTendered] = useState("");
  
  // ADVANCED CAMERA SCANNER STATES
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("idle"); // idle, starting, active, error
  const html5QrCodeRef = useRef(null);

  // Customer & Loyalty State
  const [members, setMembers] = useState([]);
  const [custSearch, setCustSearch] = useState("");
  const [cname, setCname] = useState("");
  const [showCustList, setShowCustList] = useState(false);
  
  // Ref to prevent stale data inside the camera callback
  const membersRef = useRef(members);
  useEffect(() => { membersRef.current = members; }, [members]);

  // Dining Options State
  const [orderType, setOrderType] = useState("Table"); 
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

  // ─── PURE BACK-CAMERA LOGIC W/ PERMISSION UI ───
  const stopCamera = async () => {
    if (html5QrCodeRef.current) {
      try {
        const state = html5QrCodeRef.current.getState();
        if (state === 2) { // 2 = SCANNING
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
      } catch (err) {
        console.error("Camera stop error:", err);
      }
      html5QrCodeRef.current = null;
    }
  };

  const startCamera = () => {
    setCameraStatus("starting");
    localStorage.setItem('juja_cam_granted', 'true');

    import("html5-qrcode").then(({ Html5Qrcode }) => {
      setTimeout(() => {
        try {
          if (!document.getElementById("camera-reader")) return;

          const html5QrCode = new Html5Qrcode("camera-reader");
          html5QrCodeRef.current = html5QrCode;

          html5QrCode.start(
            { facingMode: "environment" }, 
            { fps: 10, qrbox: { width: 250, height: 150 } },
            (decodedText) => {
              stopCamera();
              setIsScannerOpen(false);
              
              const exactMatch = membersRef.current.find(m => (m["Customer code"] || "").toLowerCase() === decodedText.toLowerCase());
              if (exactMatch) {
                setCustSearch(exactMatch["Customer name"]);
                setCname(exactMatch["Customer name"]);
              } else {
                setCustSearch(decodedText);
                setCname(decodedText);
                alert(`Scanned Code: ${decodedText} (Not found in Loyalty DB)`);
              }
            },
            (error) => { /* Ignore rapid frame errors */ }
          ).then(() => {
            setCameraStatus("active");
          }).catch((err) => {
            console.error("Camera start failed:", err);
            setCameraStatus("error");
          });
        } catch (e) {
          console.error("Scanner Init failed:", e);
          setCameraStatus("error");
        }
      }, 150);
    }).catch(err => {
      alert("Failed to load camera engine. Ensure 'html5-qrcode' is installed.");
      setCameraStatus("error");
    });
  };

  useEffect(() => {
    if (isScannerOpen) {
      const previouslyGranted = localStorage.getItem('juja_cam_granted');
      if (previouslyGranted) {
        startCamera(); 
      } else {
        setCameraStatus("idle"); 
      }
    } else {
      stopCamera();
    }
    return () => { stopCamera(); };
  }, [isScannerOpen]);

  // ─── POS LOGIC ───
  const filteredMembers = members.filter(m => 
    (m["Customer name"] || "").toLowerCase().includes(custSearch.toLowerCase()) ||
    (m["Customer code"] || "").toLowerCase().includes(custSearch.toLowerCase())
  );

  const filtered = items.filter(i => (cat==="ALL"||i.category===cat) && (!search||i.name.toLowerCase().includes(search.toLowerCase())));
  const getQty   = id => (cart.find(e=>e.id===id)||{}).qty || 0;

  const add = item => setCart(c => { const i=c.findIndex(e=>e.id===item.id); if(i>=0){const n=[...c];n[i]={...n[i],qty:n[i].qty+1};return n;} return [...c,{id:item.id,name:item.name,price:item.price,qty:1}]; });
  const upd = (id,d) => setCart(c => c.map(e=>e.id===id?{...e,qty:e.qty+d}:e).filter(e=>e.qty>0));
  
  const clear = () => { 
    setCart([]); setCname(""); setCustSearch(""); setTableNum(""); setNotes(""); setDisc(0); 
    setShowMobileTicket(false); setShowPaymentModal(false); setAmountTendered(""); setOrderType("Table");
  };

  const sub  = cart.reduce((s,e)=>s+e.price*e.qty,0);
  const damt  = sub*disc/100;
  const total = sub-damt;

  const formatMoney = (amount) => Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleChargeClick = () => {
    if(!cart.length) return;
    setAmountTendered(total.toString());
    setShowPaymentModal(true);
  };

  const place = (isPaid = true, paymentMethod = "Unpaid") => {
    if(!cart.length||busy) return;
    setBusy(true);
    
    const np=[]; 
    if(tableNum && (orderType === "VIP Room" || orderType === "Table")) np.push(`${orderType} #: ${tableNum}`);
    if(disc>0) np.push("Disc:"+disc+"%"); 
    if(paymentMethod !== "Unpaid") np.push(`Paid via: ${paymentMethod}`);
    if(notes) np.push(notes);

    Order.create({
      customer_name: cname || "Walk-in",
      customer_email: "", 
      customer_phone: "",
      items: cart.map(e=>({id:e.id,name:e.name,price:e.price,quantity:e.qty,subtotal:e.price*e.qty})),
      total_amount: total, 
      status: isPaid ? "Confirmed" : "Pending",
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
    .catch((err) => {
      console.error("Save Error:", err);
      alert("Order failed. Details: " + (err.message || JSON.stringify(err)));
    })
    .finally(()=>setBusy(false));
  };

  if(loading) return (
    <div className="h-screen w-full flex items-center justify-center bg-[#FFF5F7]">
      <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full"></div>
    </div>
  );

  return (
    <div className="h-[100dvh] w-full flex flex-col lg:flex-row overflow-hidden bg-slate-50 animate-in fade-in duration-500">
      
      {/* ─── LEFT PANEL: LIST MENU ─── */}
      <div className="flex-1 flex flex-col min-w-0 bg-white relative h-full">
        
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 shadow-sm z-10">
          <div className="flex items-center gap-3 flex-1">
            <button className="p-2 -ml-2 text-slate-500 hover:bg-slate-50 rounded-lg transition-colors">
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"></path></svg>
            </button>
            
            <select value={cat} onChange={e=>setCat(e.target.value)} className="bg-transparent font-bold text-slate-800 text-sm md:text-base focus:outline-none cursor-pointer max-w-[150px] md:max-w-xs truncate">
              <option value="ALL">All items</option>
              {cats.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."
                className="w-32 md:w-64 pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#FC687D] transition-all" />
            </div>
            <button className="p-2 text-slate-500 hover:bg-slate-50 rounded-lg"><svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg></button>
          </div>
        </div>

        {/* Note the pb-24 here which keeps the bottom items from hiding under the fixed bar */}
        <div className="flex-1 overflow-y-auto hide-scrollbar pb-24 lg:pb-0">
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-none divide-slate-100 p-0 md:p-3 md:gap-3">
            {filtered.map(item=>{
              const qty = getQty(item.id);
              return (
                <button key={item.id} onClick={()=>add(item)} 
                  className="flex items-center p-4 md:rounded-xl md:border md:border-slate-100 hover:bg-slate-50 active:bg-slate-100 transition-colors text-left w-full relative overflow-hidden group">
                  
                  <div className="w-12 h-12 md:w-14 md:h-14 bg-[#FFF5F7] rounded-lg border border-rose-50 flex items-center justify-center flex-shrink-0 mr-4 relative">
                    {item.image_url ? (
                       <img src={item.image_url} alt={item.name} className="w-full h-full object-cover rounded-lg" />
                    ) : (
                       <span className="text-xl opacity-50">📷</span>
                    )}
                    
                    {qty>0 && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#FC687D] flex items-center justify-center text-xs font-black text-white shadow-sm animate-in zoom-in">
                        {qty}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-slate-800 font-semibold text-sm md:text-base truncate leading-tight">{item.name}</p>
                    <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest mt-1">{item.category}</p>
                  </div>
                  
                  <div className="font-black text-slate-800 text-sm md:text-base">
                    ₱{formatMoney(item.price)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── FIXED MOBILE FLOATING BAR ─── */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-md border-t border-slate-200 z-[100] pb-safe shadow-[0_-10px_30px_rgba(0,0,0,0.08)]">
          <button onClick={() => setShowMobileTicket(true)} 
            className={`w-full py-4 rounded-xl font-black text-sm text-white flex items-center justify-between px-6 transition-all shadow-lg active:scale-95 ${cart.length ? "bg-slate-800" : "bg-slate-300"}`}>
            <span>{cart.length} Items</span>
            <span>View Ticket ➔</span>
          </button>
        </div>
      </div>

      {/* ─── RIGHT PANEL: THE TICKET ─── */}
      <div className={`fixed inset-0 z-[150] lg:static lg:z-auto w-full lg:w-[400px] flex-shrink-0 flex flex-col bg-slate-50 lg:border-l border-slate-200 shadow-2xl transition-transform duration-300 ${showMobileTicket ? "translate-y-0" : "translate-y-full lg:translate-y-0"}`}>

        <div className="flex-shrink-0 flex items-center justify-between px-4 py-4 bg-white border-b border-slate-200 pt-safe z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowMobileTicket(false)} className="lg:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors">
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            </button>
            <h2 className="font-black text-lg text-slate-800 flex items-center gap-2">Ticket <span className="bg-slate-100 border border-slate-200 text-slate-500 rounded-md px-2 py-0.5 text-xs">{cart.length}</span></h2>
          </div>
          
          <div className="flex items-center gap-2">
            <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors"><svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg></button>
          </div>
        </div>

        <div className="flex-shrink-0 flex flex-col p-4 border-b border-slate-200 bg-white">
          <div className="relative mb-3">
            
            <button 
              onClick={() => setIsScannerOpen(true)} 
              title="Open Camera" 
              className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-white hover:bg-[#FC687D] bg-slate-100 border border-slate-200 rounded-md transition-all z-10 active:scale-90 flex items-center justify-center gap-1 shadow-sm"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 5v14"></path><path d="M8 5v14"></path><path d="M12 5v14"></path><path d="M17 5v14"></path><path d="M21 5v14"></path>
              </svg>
            </button>
            
            <input 
              value={custSearch} 
              onFocus={() => setShowCustList(true)} 
              onBlur={() => setTimeout(() => setShowCustList(false), 200)}
              onChange={e => { setCustSearch(e.target.value); setCname(e.target.value); setShowCustList(true); }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const exactMatch = members.find(m => (m["Customer code"] || "").toLowerCase() === custSearch.toLowerCase());
                  if (exactMatch) {
                    setCustSearch(exactMatch["Customer name"]);
                    setCname(exactMatch["Customer name"]);
                    setShowCustList(false);
                  }
                }
              }}
              placeholder="Scan Barcode or Search..."
              className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all" 
            />
            
            {showCustList && custSearch && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 shadow-xl rounded-lg max-h-48 overflow-y-auto hide-scrollbar z-50">
                {filteredMembers.length > 0 ? filteredMembers.map(m => (
                  <button key={m.id} onMouseDown={() => { setCustSearch(m["Customer name"]); setCname(m["Customer name"]); setShowCustList(false); }} className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 transition-colors">
                    <p className="font-bold text-slate-800 text-sm leading-tight">{m["Customer name"]}</p>
                    <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{m["Customer code"]}</p>
                  </button>
                )) : (<div className="px-4 py-3 text-xs text-slate-400 bg-slate-50 italic">Walk-In: "{custSearch}"</div>)}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <select 
                value={orderType} 
                onChange={e=>setOrderType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-8 py-2.5 text-xs font-bold text-slate-700 uppercase tracking-widest focus:outline-none focus:border-[#FC687D] transition-all appearance-none cursor-pointer"
              >
                <option value="Table">Table</option>
                <option value="VIP Room">VIP Room</option>
                <option value="Takeout">Takeout</option>
                <option value="Grab | Panda">Grab | Panda</option>
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[10px]">▼</span>
            </div>

            {(orderType === "VIP Room" || orderType === "Table") && (
              <input value={tableNum} onChange={e=>setTableNum(e.target.value)} placeholder={`#`}
                className="w-16 bg-slate-50 border border-slate-200 rounded-lg px-2 py-2.5 text-xs font-bold focus:outline-none focus:border-[#FC687D] transition-all text-center" />
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto hide-scrollbar bg-slate-50">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-300">
              <span className="text-5xl mb-4 opacity-30">🧾</span>
              <p className="font-bold text-xs uppercase tracking-widest">Ticket is empty</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200/50">
              {cart.map(item => (
                <div key={item.id} className="flex items-center p-4 bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="flex-1 pr-4">
                    <p className="font-semibold text-slate-800 text-sm leading-tight">{item.name}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center bg-white rounded border border-slate-200 shadow-sm">
                        <button onClick={()=>upd(item.id,-1)} className="w-8 h-7 flex items-center justify-center text-slate-500 font-black hover:text-rose-500 hover:bg-rose-50 rounded-l active:bg-rose-100">−</button>
                        <span className="w-6 text-center font-black text-slate-800 text-xs">{item.qty}</span>
                        <button onClick={()=>upd(item.id,1)} className="w-8 h-7 flex items-center justify-center text-slate-500 font-black hover:text-emerald-500 hover:bg-emerald-50 rounded-r active:bg-emerald-100">+</button>
                      </div>
                      <span className="text-slate-400 font-semibold text-[10px]">₱{formatMoney(item.price)} each</span>
                    </div>
                  </div>
                  <div className="font-black text-slate-800 text-sm">
                    ₱{formatMoney(item.price * item.qty)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 bg-slate-50 border-t border-slate-200">
          <button onClick={()=>setShowDisc(!showDisc)} className="w-full flex justify-between items-center px-4 lg:px-5 py-3 hover:bg-slate-100 active:bg-slate-200 transition-colors">
            <span className="font-bold text-xs text-slate-500 uppercase tracking-widest">Discount {disc>0 ? `(${disc}%)` : ""}</span>
            <span className="text-rose-500 font-bold text-sm">{damt > 0 ? `-₱${formatMoney(damt)}` : "Add >"}</span>
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

        <div className="flex-shrink-0 bg-white p-3 border-t border-slate-200 pb-safe">
          <div className="flex gap-2">
            <button onClick={() => place(false, "Unpaid")} disabled={!cart.length||busy}
              className="flex-1 py-4 rounded-xl font-black text-xs uppercase tracking-widest text-[#10b981] bg-[#10b981]/10 hover:bg-[#10b981]/20 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 border border-[#10b981]/20">
              SAVE
            </button>

            <button onClick={handleChargeClick} disabled={!cart.length||busy}
              className="flex-[1.5] py-4 rounded-xl font-black text-sm text-white transition-all active:scale-95 flex flex-col items-center justify-center shadow-md disabled:opacity-50 disabled:shadow-none"
              style={{ backgroundColor: cart.length ? "#10b981" : "#cbd5e1" }}>
              <span className="text-[10px] uppercase tracking-widest opacity-90 -mb-0.5">CHARGE</span>
              <span>₱{formatMoney(total)}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── LIVE CAMERA SCANNER MODAL WITH CUSTOM UI ─── */}
      {isScannerOpen && (
        <div className="fixed inset-0 z-[400] bg-slate-900/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative flex flex-col min-h-[400px]">
            
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <svg className="w-5 h-5 text-[#FC687D]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5h2v14H3zM7 5h1v14H7zM10 5h2v14h-2zM14 5h1v14h-1zM17 5h2v14h-2zM20 5h1v14h-1z" /></svg>
                Scan Loyalty Card
              </h3>
              <button onClick={() => setIsScannerOpen(false)} className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center font-bold text-slate-600 hover:bg-slate-300 transition-colors">✕</button>
            </div>
            
            <div className="relative bg-black/5 flex-1 flex flex-col p-4 overflow-hidden">
              
              <div id="camera-reader" className={`w-full rounded-xl overflow-hidden shadow-inner bg-black flex-1 min-h-[250px] ${cameraStatus === "active" ? "opacity-100" : "opacity-0 absolute"}`}></div>
              
              {cameraStatus === "idle" && (
                <div className="absolute inset-0 bg-white flex flex-col items-center justify-center p-8 text-center z-10">
                  <span className="text-5xl mb-4">📸</span>
                  <h3 className="font-black text-xl text-slate-800 mb-2">Camera Access Required</h3>
                  <p className="text-sm font-semibold text-slate-500 mb-6 leading-relaxed">We need permission to use your device's back camera to instantly scan customer loyalty barcodes.</p>
                  <button onClick={startCamera} className="w-full py-4 bg-[#FC687D] text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md active:scale-95 transition-all">
                    Enable Camera
                  </button>
                </div>
              )}

              {cameraStatus === "starting" && (
                <div className="absolute inset-0 bg-white flex flex-col items-center justify-center z-10">
                  <div className="w-10 h-10 border-4 border-rose-100 border-t-[#FC687D] animate-spin rounded-full mb-4"></div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 animate-pulse">Initializing Camera...</p>
                </div>
              )}

              {cameraStatus === "error" && (
                <div className="absolute inset-0 bg-white flex flex-col items-center justify-center p-8 text-center z-10">
                  <span className="text-5xl mb-4">❌</span>
                  <h3 className="font-black text-xl text-slate-800 mb-2">Camera Blocked</h3>
                  <p className="text-sm font-semibold text-slate-500 mb-6 leading-relaxed">Access was denied or no back camera was found. Ensure you are on a secure connection (HTTPS).</p>
                  <button onClick={startCamera} className="w-full py-4 bg-slate-800 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md active:scale-95 transition-all">
                    Try Again
                  </button>
                </div>
              )}

            </div>
            
            <div className="p-4 text-center text-[10px] font-bold text-slate-400 bg-slate-50 border-t border-slate-100 uppercase tracking-widest">
              Hold the barcode steady inside the frame
            </div>
          </div>
        </div>
      )}

      {/* ─── PAYMENT MODAL ─── */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex flex-col pt-10 pb-safe px-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md mx-auto bg-[#1a1a1a] rounded-3xl overflow-hidden flex flex-col flex-1 max-h-[800px] shadow-2xl border border-slate-800">
            
            <div className="flex items-center px-4 py-4 border-b border-slate-800 relative">
              <button onClick={() => setShowPaymentModal(false)} className="text-white p-2">
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
              </button>
              <h2 className="absolute left-1/2 -translate-x-1/2 font-bold text-xs uppercase tracking-widest text-slate-400">SPLIT</h2>
            </div>

            <div className="py-8 text-center border-b border-slate-800">
              <h1 className="font-black text-4xl text-white tracking-tight mb-2">₱{formatMoney(total)}</h1>
              <p className="font-semibold text-sm text-slate-400">Total amount due</p>
            </div>

            <div className="px-6 py-6">
              <label className="block text-xs font-bold text-emerald-500 mb-2">Cash received</label>
              <input 
                type="number" step="0.01" value={amountTendered} onChange={e=>setAmountTendered(e.target.value)}
                className="w-full bg-transparent border-b border-slate-600 text-white font-black text-xl py-2 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3 hide-scrollbar">
              {[
                { id: "CASH", icon: "💵" },
                { id: "GRABFOOD", icon: "🥡" },
                { id: "QRPH", icon: "📱" },
                { id: "GRAB DINE OUT", icon: "🍽️" },
                { id: "CARD", icon: "💳" }
              ].map(pm => (
                <button key={pm.id} onClick={() => { setShowPaymentModal(false); place(true, pm.id); }}
                  className="w-full py-4 bg-[#2a2a2a] hover:bg-[#333] active:bg-[#444] rounded-xl flex items-center justify-center gap-3 transition-colors border border-slate-700/50">
                  <span className="text-lg grayscale opacity-70">{pm.icon}</span>
                  <span className="font-bold text-sm text-white tracking-wide">{pm.id}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── RECEIPT MODAL ─── */}
      {receipt && (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
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
                  <span className="font-semibold text-slate-600 flex-1 pr-4">{item.name} <span className="text-slate-400 text-[10px] lg:text-xs ml-1">x{item.qty}</span></span>
                  <span className="font-black text-slate-800">₱{formatMoney(item.price * item.qty)}</span>
                </div>
              ))}
              
              <div className="border-t border-slate-200 pt-4 mt-4 space-y-2">
                <div className="flex justify-between font-black text-lg text-slate-800 pt-1">
                  <span>{receipt.isPaid ? "Total Paid" : "Balance Due"}</span>
                  <span>₱{formatMoney(receipt.total)}</span>
                </div>
                {receipt.isPaid && receipt.method === "CASH" && (
                  <div className="flex justify-between text-xs font-bold text-emerald-500">
                    <span>Change</span>
                    <span>₱{formatMoney(receipt.change)}</span>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl p-3 mt-4 text-[10px] font-bold text-slate-500 border border-slate-100 space-y-1 shadow-sm">
                <p className="flex justify-between"><span className="uppercase tracking-widest text-[8px] text-slate-400">Payment</span> <span>{receipt.method}</span></p>
                <p className="flex justify-between"><span className="uppercase tracking-widest text-[8px] text-slate-400">Type</span> <span>{receipt.type}</span></p>
                {receipt.table && <p className="flex justify-between"><span className="uppercase tracking-widest text-[8px] text-slate-400">Location</span> <span>{receipt.table}</span></p>}
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