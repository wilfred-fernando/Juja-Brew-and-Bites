"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

const catEmoji = { "Chicken":"🍗","Rice in a Box":"🍚","Rice Meal":"🍱","All Day Breakfast":"🍳","Coffee":"☕","Milk Tea":"🧋","Frappe":"🥤","Snacks":"🍟","Waffles":"🧇","Pasta":"🍝","Group Tray":"🫕", "Cookies":"🍪", "Signature":"✨", "Pastries":"🥐" };

function cartKey(itemId, selectedOptions) {
  if (!selectedOptions || selectedOptions.length === 0) return itemId;
  return `${itemId}__${selectedOptions.map(o => `${o.group}:${o.choice}`).join("|")}`;
}

export default function OrderPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState({});
  const [activeCategory, setActiveCategory] = useState("All");
  const [step, setStep] = useState("menu"); 
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [form, setForm] = useState({
    customer_name: "", customer_email: "", customer_phone: "",
    order_type: "Delivery", delivery_address: "", notes: ""
  });
  const [orderId, setOrderId] = useState(null);
  const [error, setError] = useState("");
  
  const [optionModal, setOptionModal] = useState(null);
  const [pendingSelections, setPendingSelections] = useState({});

  useEffect(() => {
    async function loadMenu() {
      setLoading(true);
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .or('status.eq.available,is_available.eq.true'); 
      
      if (!error && data) {
        setItems(data);
        const uniqueCats = [...new Set(data.map(i => i.category))];
        const builtCategories = uniqueCats.map(name => ({
          name,
          icon: catEmoji[name] || "🍽"
        })).sort((a, b) => a.name.localeCompare(b.name));
        setCategories(builtCategories);
      }
      setLoading(false);
    }
    loadMenu();
  }, []);

  const catIconMap = Object.fromEntries(categories.map(c => [c.name, c.icon]));

  const cartEntries = Object.values(cart);
  const cartTotal = cartEntries.reduce((s, e) => s + e.unitPrice * e.qty, 0);
  const cartCount = cartEntries.reduce((s, e) => s + e.qty, 0);

  const openOptionModal = (item) => {
    const defaults = {};
    (item.option_groups || []).forEach(g => { defaults[g.name] = g.multi_select ? [] : ""; });
    setPendingSelections(defaults);
    setOptionModal({ item });
  };

  const handleAddWithOptions = () => {
    const item = optionModal.item;
    for (const g of (item.option_groups || [])) {
      if (g.required) {
        const val = pendingSelections[g.name];
        if (!val || (Array.isArray(val) && val.length === 0)) {
          alert(`Please select an option for "${g.name}"`);
          return;
        }
      }
    }
    const selectedOptions = [];
    let extraPrice = 0;
    (item.option_groups || []).forEach(g => {
      const val = pendingSelections[g.name];
      if (Array.isArray(val)) {
        val.forEach(choice => {
          const opt = g.choices?.find(o => o.label === choice) || g.options?.find(o => o.name === choice);
          const pAdd = Number(opt?.price_adjustment || opt?.price_add || 0);
          extraPrice += pAdd;
          selectedOptions.push({ group: g.name, choice, price_add: pAdd });
        });
      } else if (val) {
        const opt = g.choices?.find(o => o.label === val) || g.options?.find(o => o.name === val);
        const pAdd = Number(opt?.price_adjustment || opt?.price_add || 0);
        extraPrice += pAdd;
        selectedOptions.push({ group: g.name, choice: val, price_add: pAdd });
      }
    });
    
    const unitPrice = Number(item.price || 0) + extraPrice;
    const key = cartKey(item.id, selectedOptions);
    setCart(c => ({ ...c, [key]: c[key] ? { ...c[key], qty: c[key].qty + 1 } : { item, qty: 1, selectedOptions, unitPrice, key } }));
    setOptionModal(null);
  };

  const handleDirectAdd = (item) => {
    if ((item.option_groups || []).length > 0) { openOptionModal(item); return; }
    const key = cartKey(item.id, []);
    setCart(c => ({ ...c, [key]: c[key] ? { ...c[key], qty: c[key].qty + 1 } : { item, qty: 1, selectedOptions: [], unitPrice: Number(item.price), key } }));
  };

  const increaseCart = (key) => setCart(c => ({ ...c, [key]: { ...c[key], qty: c[key].qty + 1 } }));
  const decreaseCart = (key) => setCart(c => { const n = { ...c }; if (n[key].qty > 1) n[key] = { ...n[key], qty: n[key].qty - 1 }; else delete n[key]; return n; });

  const filtered = activeCategory === "All" ? items : items.filter(i => i.category === activeCategory);

  const tax = cartTotal * 0.1;
  const deliveryFee = form.order_type === "Delivery" ? 150 : 0;
  const total = cartTotal + tax + deliveryFee;

  const handleCheckout = async (e) => {
    e.preventDefault();
    setError("");
    if (cartEntries.length === 0) { setError("Your cart is empty."); return; }
    if (form.order_type === "Delivery" && !form.delivery_address) { setError("Please enter a delivery address."); return; }
    setSubmitting(true);
    try {
      const orderItems = cartEntries.map(({ item, qty, selectedOptions, unitPrice }) => ({
        id: item.id, name: item.name, price: unitPrice, quantity: qty,
        subtotal: parseFloat((unitPrice * qty).toFixed(2)),
        selected_options: selectedOptions
      }));
      
      const newOrder = {
        customer_name: form.customer_name,
        customer_email: form.customer_email,
        customer_phone: form.customer_phone,
        order_type: form.order_type,
        delivery_address: form.delivery_address,
        notes: form.notes,
        items: orderItems,
        total_amount: parseFloat(total.toFixed(2)),
        status: "Pending"
      };

      const { data, error: dbError } = await supabase.from("orders").insert([newOrder]).select();
      if (dbError) throw dbError;
      
      setOrderId(data[0].id);
      setStep("confirmation");
    } catch (err) { 
      console.error(err);
      setError("Failed to place order. Please try again."); 
    } finally { 
      setSubmitting(false); 
    }
  };

  if (step === "confirmation") {
    return (
      <div className="min-h-screen bg-[#FFF5F7] font-sans flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-md w-full text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="text-7xl mb-6 drop-shadow-sm">🎉</div>
          <h1 className="text-4xl font-extrabold mb-3 text-slate-800 tracking-tight">Order <span className="text-[#FC687D]">Placed!</span></h1>
          <p className="text-slate-500 mb-2 font-bold uppercase tracking-widest text-sm">Thank you, {form.customer_name}!</p>
          <p className="text-slate-400 mb-8 font-medium">Your order has been sent to our kitchen. You'll receive updates shortly.</p>
          
          <div className="bg-white rounded-3xl p-8 border border-rose-50 shadow-sm mb-8 text-left space-y-4">
            <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest border-b border-rose-50 pb-4"><span className="text-slate-400">Order ID</span><span className="text-slate-800">{orderId?.slice(-8).toUpperCase()}</span></div>
            <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest border-b border-rose-50 pb-4"><span className="text-slate-400">Type</span><span className="text-slate-800">{form.order_type}</span></div>
            <div className="flex justify-between items-center text-sm font-extrabold uppercase tracking-widest pt-2"><span className="text-slate-400">Total</span><span className="text-[#FC687D]">₱{total.toFixed(2)}</span></div>
          </div>
          
          <div className="space-y-4">
            <Link href="/" className="block w-full py-4 bg-[#FC687D] text-white text-xs font-bold uppercase tracking-widest rounded-full hover:bg-rose-500 hover:-translate-y-0.5 transition-all shadow-[0_8px_20px_rgba(252,104,125,0.3)] text-center">Back to Home</Link>
            <button onClick={() => { setCart({}); setForm({ customer_name: "", customer_email: "", customer_phone: "", order_type: "Delivery", delivery_address: "", notes: "" }); setStep("menu"); }}
              className="block w-full py-4 bg-white border border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-widest rounded-full hover:border-[#FC687D] hover:text-[#FC687D] transition-colors text-center">
              Place Another Order
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF5F7] font-sans">
      
      {/* Option Picker Modal */}
      {optionModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
            <div className="p-8 border-b border-rose-50 sticky top-0 bg-white/95 backdrop-blur-sm z-10 rounded-t-3xl">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-extrabold text-xl tracking-tight text-slate-800">{optionModal.item.name}</h3>
                  <p className="text-[#FC687D] font-black text-sm mt-1">₱{Number(optionModal.item.price).toFixed(2)}</p>
                </div>
                <button onClick={() => setOptionModal(null)} className="text-slate-400 hover:text-slate-800 bg-slate-50 w-8 h-8 rounded-full flex items-center justify-center transition-colors font-bold text-xl pb-1">×</button>
              </div>
              {optionModal.item.description && <p className="text-slate-500 text-xs mt-3 leading-relaxed font-medium">{optionModal.item.description}</p>}
            </div>
            
            <div className="p-8">
              {(optionModal.item.option_groups || []).map((group, gi) => (
                <div key={gi} className="mb-8 last:mb-0">
                  <div className="flex items-center gap-3 mb-4">
                    <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-widest">{group.name}</h4>
                    {group.required && <span className="text-[9px] bg-rose-50 text-[#FC687D] px-2.5 py-1 rounded-full font-bold uppercase tracking-widest">Required</span>}
                    {group.multi_select && <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Multiple</span>}
                  </div>
                  <div className="space-y-3">
                    {(group.choices || group.options || []).map((opt, oi) => {
                      const optName = opt.label || opt.name;
                      const optPrice = Number(opt.price_adjustment || opt.price_add || 0);
                      const val = pendingSelections[group.name];
                      const isSelected = group.multi_select ? (val || []).includes(optName) : val === optName;
                      
                      const toggle = () => {
                        if (group.multi_select) {
                          const cur = pendingSelections[group.name] || [];
                          setPendingSelections(s => ({ ...s, [group.name]: isSelected ? cur.filter(v => v !== optName) : [...cur, optName] }));
                        } else {
                          setPendingSelections(s => ({ ...s, [group.name]: optName }));
                        }
                      };
                      return (
                        <button key={oi} type="button" onClick={toggle}
                          className={`w-full flex justify-between items-center px-5 py-4 rounded-2xl border transition-all duration-200 ${isSelected ? "border-[#FC687D] bg-rose-50 shadow-sm" : "border-slate-100 bg-white hover:border-[#FC687D]"}`}>
                          <div className="flex items-center gap-4">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? "border-[#FC687D]" : "border-slate-300"}`}>
                              {isSelected && <div className="w-2.5 h-2.5 bg-[#FC687D] rounded-full" />}
                            </div>
                            <span className={`text-sm font-bold tracking-wide ${isSelected ? "text-slate-800" : "text-slate-600"}`}>{optName}</span>
                          </div>
                          {optPrice > 0 && <span className="text-slate-400 text-xs font-bold">+₱{optPrice.toFixed(2)}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-rose-50 bg-white sticky bottom-0 z-10 rounded-b-3xl">
              <button onClick={handleAddWithOptions} className="w-full py-4 bg-[#FC687D] text-white text-xs font-bold uppercase tracking-widest rounded-full hover:bg-rose-500 hover:-translate-y-0.5 transition-all shadow-[0_8px_20px_rgba(252,104,125,0.3)]">Add to Order</button>
            </div>
          </div>
        </div>
      )}

      {/* Top Nav */}
      <nav className="fixed top-0 w-full z-40 bg-white/90 backdrop-blur-md shadow-[0_2px_20px_rgba(0,0,0,0.03)] border-b border-rose-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/"><img src={LOGO} alt="Juja" className="h-10 md:h-12 object-contain" /></Link>
          <div className="hidden md:flex gap-8 text-slate-500 text-xs font-bold uppercase tracking-widest">
            <Link href="/" className="hover:text-[#FC687D] transition-colors">Home</Link>
            <Link href="/menu" className="hover:text-[#FC687D] transition-colors">Menu</Link>
            <Link href="/order" className="text-[#FC687D]">Order</Link>
          </div>
          <div className="flex gap-4 items-center">
            {cartCount > 0 && step === "menu" && (
              <button onClick={() => setStep("checkout")}
                className="text-[10px] sm:text-xs px-5 sm:px-6 py-2.5 rounded-full bg-[#FC687D] text-white font-bold uppercase tracking-widest hover:bg-rose-500 transition-all flex items-center gap-3 shadow-[0_4px_15px_rgba(252,104,125,0.3)]">
                <span>🛒 {cartCount}</span> <span className="w-[2px] h-3 rounded-full bg-white/40"></span> <span>₱{cartTotal.toFixed(2)}</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      <div className="pt-20">
        {step === "menu" && (
          <div className="flex h-[calc(100vh-80px)]">
            
            {/* Menu Side */}
            <div className="flex-1 overflow-y-auto pb-24 lg:pb-0 hide-scrollbar">
              
              <div className="sticky top-0 z-30 bg-[#FFF5F7]/95 backdrop-blur-md border-b border-rose-100 px-6 py-4 shadow-sm">
                <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1">
                  <button onClick={() => setActiveCategory("All")}
                    className={`flex-shrink-0 px-6 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all shadow-sm ${activeCategory === "All" ? "bg-[#FC687D] text-white border-transparent" : "bg-white border border-rose-100 text-slate-500 hover:border-[#FC687D] hover:text-[#FC687D]"}`}>
                    ✨ All
                  </button>
                  {categories.map(cat => (
                    <button key={cat.id || cat.name} onClick={() => setActiveCategory(cat.name)}
                      className={`flex-shrink-0 px-6 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 shadow-sm ${activeCategory === cat.name ? "bg-[#FC687D] text-white border-transparent" : "bg-white border border-rose-100 text-slate-500 hover:border-[#FC687D] hover:text-[#FC687D]"}`}>
                      <span className="text-base">{cat.icon}</span> {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-6 md:p-10 max-w-5xl mx-auto">
                <h1 className="text-3xl font-extrabold mb-8 tracking-tight text-slate-800">Order <span className="text-[#FC687D]">Online</span></h1>
                
                {loading ? (
                  <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full"></div></div>
                ) : (
                  <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filtered.map(item => {
                      const itemEntries = cartEntries.filter(e => e.item.id === item.id);
                      const totalQty = itemEntries.reduce((s, e) => s + e.qty, 0);
                      const hasOptions = (item.option_groups || []).length > 0;
                      
                      return (
                        <div key={item.id} className="bg-white rounded-3xl p-5 border border-rose-50 flex flex-col justify-between hover:shadow-[0_10px_30px_rgba(252,104,125,0.08)] hover:-translate-y-1 transition-all group">
                          <div>
                            <div className="flex justify-between items-start mb-3">
                              <h3 className="font-extrabold text-slate-800 text-[15px] tracking-wide leading-tight group-hover:text-[#FC687D] transition-colors">{item.name}</h3>
                              <span className="text-[#FC687D] font-black text-[15px] ml-3 flex-shrink-0 bg-rose-50 px-2.5 py-1 rounded-full">₱{Number(item.price).toFixed(2)}</span>
                            </div>
                            <p className="text-slate-400 text-xs mt-1 mb-4 leading-relaxed line-clamp-2 font-medium">{item.description}</p>
                            {hasOptions && (
                              <p className="text-[9px] text-slate-400 mb-4 font-bold uppercase tracking-widest flex items-center gap-1">⚙ Customizable</p>
                            )}
                          </div>
                          
                          <div className="mt-auto pt-4 border-t border-rose-50 flex items-center justify-between">
                            {totalQty > 0 && !hasOptions ? (
                              <div className="flex items-center gap-4 bg-[#FFF5F7] rounded-full p-1 border border-rose-100 w-full justify-between">
                                <button onClick={() => decreaseCart(cartKey(item.id, []))} className="w-9 h-9 bg-white rounded-full text-slate-600 hover:bg-slate-50 transition flex items-center justify-center font-bold shadow-sm">−</button>
                                <span className="text-[#FC687D] font-black text-sm min-w-[20px] text-center">{totalQty}</span>
                                <button onClick={() => increaseCart(cartKey(item.id, []))} className="w-9 h-9 bg-[#FC687D] rounded-full text-white hover:bg-rose-500 transition flex items-center justify-center font-bold shadow-sm">+</button>
                              </div>
                            ) : (
                              <button onClick={() => handleDirectAdd(item)}
                                className="w-full py-3 bg-white border border-slate-200 text-slate-600 rounded-full text-[10px] font-bold uppercase tracking-widest hover:border-[#FC687D] hover:text-[#FC687D] hover:bg-rose-50 transition-colors shadow-sm">
                                {totalQty > 0 ? `${totalQty} in cart · Add more` : hasOptions ? "Customize +" : "Add to Cart +"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Cart Side (desktop) */}
            <div className="w-[400px] border-l border-rose-100 bg-white flex-col hidden lg:flex shadow-2xl z-40 relative">
              <div className="p-8 border-b border-rose-50 bg-white z-10">
                <h2 className="font-extrabold text-slate-800 text-2xl tracking-tight mb-5">Your <span className="text-[#FC687D]">Order</span></h2>
                <div className="flex gap-2 p-1.5 bg-[#FFF5F7] border border-rose-100 rounded-full">
                  {["Delivery", "Pickup"].map(t => (
                    <button key={t} onClick={() => setForm(f => ({ ...f, order_type: t }))}
                      className={`flex-1 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${form.order_type === t ? "bg-white text-[#FC687D] shadow-sm border border-rose-50" : "text-slate-500 hover:text-slate-800 border border-transparent"}`}>
                      {t === "Delivery" ? "🚚" : "🏃"} {t}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 bg-[#FFF5F7]/30 hide-scrollbar">
                {cartEntries.length === 0 ? (
                  <div className="text-center text-slate-400 py-24">
                    <div className="text-5xl mb-4 opacity-40">🛒</div>
                    <p className="text-xs font-bold uppercase tracking-widest">Cart is empty</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {cartEntries.map(entry => (
                      <div key={entry.key} className="bg-white p-5 rounded-3xl border border-rose-50 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex-1 pr-4">
                            <p className="text-[14px] text-slate-800 font-extrabold tracking-wide leading-tight">{entry.item.name}</p>
                            {entry.selectedOptions?.length > 0 && (
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-2 leading-relaxed">{entry.selectedOptions.map(o => o.choice).join(", ")}</p>
                            )}
                            <p className="text-xs text-[#FC687D] font-black mt-2">₱{entry.unitPrice?.toFixed(2)}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between border-t border-rose-50 pt-3">
                           <div className="flex items-center gap-3 bg-[#FFF5F7] p-1 rounded-full border border-rose-100">
                            <button onClick={() => decreaseCart(entry.key)} className="w-7 h-7 bg-white border border-rose-50 rounded-full text-slate-500 text-xs flex items-center justify-center hover:text-rose-500 hover:border-rose-200 transition-colors shadow-sm">−</button>
                            <span className="text-slate-800 text-xs font-black w-4 text-center">{entry.qty}</span>
                            <button onClick={() => increaseCart(entry.key)} className="w-7 h-7 bg-[#FC687D] rounded-full text-xs text-white flex items-center justify-center hover:bg-rose-500 transition-colors shadow-sm">+</button>
                          </div>
                          <span className="font-black text-slate-800 text-sm">₱{(entry.unitPrice * entry.qty).toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {cartEntries.length > 0 && (
                <div className="p-8 border-t border-rose-100 bg-white z-10 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
                  <div className="space-y-3 mb-6 bg-[#FFF5F7] p-5 rounded-3xl border border-rose-50">
                    <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-widest"><span>Subtotal</span><span className="text-slate-800">₱{cartTotal.toFixed(2)}</span></div>
                    <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-widest"><span>Tax (10%)</span><span className="text-slate-800">₱{tax.toFixed(2)}</span></div>
                    {form.order_type === "Delivery" && <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-widest"><span>Delivery</span><span className="text-slate-800">₱150.00</span></div>}
                    <div className="flex justify-between items-end pt-4 mt-2 border-t border-rose-100">
                      <span className="font-black text-sm uppercase tracking-widest text-slate-800">Total</span>
                      <span className="text-2xl font-black text-[#FC687D]">₱{total.toFixed(2)}</span>
                    </div>
                  </div>
                  <button onClick={() => setStep("checkout")} className="w-full py-4 bg-[#FC687D] text-white text-xs font-bold uppercase tracking-widest rounded-full hover:bg-rose-500 hover:-translate-y-0.5 transition-all shadow-[0_8px_20px_rgba(252,104,125,0.3)]">
                    Checkout Securely →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mobile Cart Button */}
        {step === "menu" && cartCount > 0 && (
          <div className="fixed bottom-6 left-0 right-0 px-6 lg:hidden z-40">
            <button onClick={() => setStep("checkout")} className="w-full py-4 bg-[#FC687D] text-white font-bold rounded-full hover:bg-rose-500 transition-all shadow-[0_10px_30px_rgba(252,104,125,0.4)] flex items-center justify-between px-8">
              <span className="text-[11px] uppercase tracking-widest font-black">🛒 {cartCount} items</span>
              <span className="text-[11px] tracking-widest font-black">Checkout · ₱{total.toFixed(2)}</span>
            </button>
          </div>
        )}

        {/* Checkout Screen */}
        {step === "checkout" && (
          <div className="max-w-6xl mx-auto px-6 py-12 grid lg:grid-cols-5 gap-12 animate-in fade-in duration-500">
            <div className="lg:col-span-3 order-2 lg:order-1">
              <button onClick={() => setStep("menu")} className="text-slate-400 hover:text-[#FC687D] transition-colors mb-8 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest bg-white py-2 px-4 rounded-full shadow-sm w-fit border border-rose-50">← Back to Menu</button>
              
              <div className="bg-white p-8 md:p-12 rounded-3xl border border-rose-100 shadow-sm">
                <h2 className="text-3xl font-extrabold mb-8 tracking-tight text-slate-800">Checkout <span className="text-[#FC687D]">Details</span></h2>
                
                <form onSubmit={handleCheckout} className="space-y-6">
                  {/* Mobile Order Type Toggle */}
                  <div className="lg:hidden flex gap-2 p-1.5 bg-[#FFF5F7] border border-rose-100 rounded-full mb-8">
                    {["Delivery", "Pickup"].map(type => (
                      <button key={type} type="button" onClick={() => setForm(f => ({ ...f, order_type: type }))}
                        className={`flex-1 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${form.order_type === type ? "bg-white text-[#FC687D] shadow-sm border border-rose-50" : "text-slate-500 hover:text-slate-800 border border-transparent"}`}>
                        {type}
                      </button>
                    ))}
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    {[
                      { label: "Full Name *", field: "customer_name", type: "text", placeholder: "John Doe" },
                      { label: "Email Address *", field: "customer_email", type: "email", placeholder: "you@example.com" },
                      { label: "Phone Number *", field: "customer_phone", type: "tel", placeholder: "09XX XXX XXXX" },
                    ].map(f => (
                      <div key={f.field} className={f.field === "customer_name" ? "md:col-span-2" : ""}>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">{f.label}</label>
                        <input required type={f.type} value={form[f.field]} onChange={e => setForm({ ...form, [f.field]: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-sm font-bold placeholder-slate-300 focus:outline-none focus:border-[#FC687D] focus:ring-2 focus:ring-[#FC687D]/20 focus:bg-white transition-all"
                          placeholder={f.placeholder} />
                      </div>
                    ))}
                  </div>
                  
                  {form.order_type === "Delivery" && (
                    <div className="animate-in fade-in slide-in-from-top-4 duration-300 pt-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Delivery Address *</label>
                      <input required type="text" value={form.delivery_address} onChange={e => setForm({ ...form, delivery_address: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-sm font-bold placeholder-slate-300 focus:outline-none focus:border-[#FC687D] focus:ring-2 focus:ring-[#FC687D]/20 focus:bg-white transition-all"
                        placeholder="House No., Street, Barangay, City" />
                    </div>
                  )}
                  
                  <div className="pt-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Special Instructions</label>
                    <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 text-sm font-bold placeholder-slate-300 focus:outline-none focus:border-[#FC687D] focus:ring-2 focus:ring-[#FC687D]/20 focus:bg-white transition-all resize-none"
                      placeholder="Allergies, preferences, or special requests..." />
                  </div>
                  
                  {error && <div className="bg-rose-50 border border-rose-200 rounded-2xl px-5 py-4 text-[#FC687D] text-[11px] font-bold uppercase tracking-widest mt-4 flex items-center gap-2"><span>⚠️</span>{error}</div>}
                  
                  <div className="pt-8 mt-4 border-t border-rose-50">
                    <button type="submit" disabled={submitting}
                      className="w-full py-5 bg-[#FC687D] text-white text-xs font-black uppercase tracking-widest rounded-full hover:bg-rose-500 hover:-translate-y-0.5 transition-all shadow-[0_10px_30px_rgba(252,104,125,0.3)] disabled:opacity-50 disabled:hover:translate-y-0 flex items-center justify-center gap-3">
                      {submitting ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span> : `Confirm Order · ₱${total.toFixed(2)}`}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Order Summary Side (Checkout) */}
            <div className="lg:col-span-2 order-1 lg:order-2">
              <div className="bg-white rounded-3xl p-8 border border-rose-100 shadow-sm sticky top-28">
                <h3 className="font-extrabold text-2xl mb-6 tracking-tight text-slate-800">Summary</h3>
                
                {/* Desktop Order Type Toggle */}
                <div className="hidden lg:flex gap-2 p-1.5 bg-[#FFF5F7] border border-rose-100 rounded-full mb-8">
                  {["Delivery", "Pickup"].map(type => (
                    <button key={type} type="button" onClick={() => setForm(f => ({ ...f, order_type: type }))}
                      className={`flex-1 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${form.order_type === type ? "bg-white text-[#FC687D] shadow-sm border border-rose-50" : "text-slate-500 hover:text-slate-800"}`}>
                      {type}
                    </button>
                  ))}
                </div>

                <div className="space-y-4 mb-8 max-h-[40vh] overflow-y-auto pr-2 hide-scrollbar">
                  {cartEntries.map(entry => (
                    <div key={entry.key} className="text-sm border-b border-rose-50 pb-5 last:border-0 last:pb-0">
                      <div className="flex justify-between items-start">
                        <div className="flex gap-3">
                          <span className="text-[#FC687D] font-black bg-rose-50 px-2 py-0.5 rounded-md">{entry.qty}×</span>
                          <span className="font-extrabold text-slate-800 leading-tight">{entry.item.name}</span>
                        </div>
                        <span className="text-slate-800 font-bold ml-4 text-sm">₱{(entry.unitPrice * entry.qty).toFixed(2)}</span>
                      </div>
                      {entry.selectedOptions?.length > 0 && (
                        <p className="ml-11 text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">{entry.selectedOptions.map(o => o.choice).join(", ")}</p>
                      )}
                    </div>
                  ))}
                </div>
                
                <div className="border-t border-rose-100 pt-6 space-y-4">
                  <div className="flex justify-between text-[11px] font-bold text-slate-500 uppercase tracking-widest"><span>Subtotal</span><span className="text-slate-800">₱{cartTotal.toFixed(2)}</span></div>
                  <div className="flex justify-between text-[11px] font-bold text-slate-500 uppercase tracking-widest"><span>Tax (10%)</span><span className="text-slate-800">₱{tax.toFixed(2)}</span></div>
                  {form.order_type === "Delivery" && <div className="flex justify-between text-[11px] font-bold text-slate-500 uppercase tracking-widest"><span>Delivery Fee</span><span className="text-slate-800">₱150.00</span></div>}
                  <div className="flex justify-between items-end pt-4 mt-4 border-t border-rose-100 bg-[#FFF5F7] p-5 rounded-2xl">
                    <span className="text-sm font-black uppercase tracking-widest text-slate-800">Total</span>
                    <span className="text-3xl font-black text-[#FC687D]">₱{total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}