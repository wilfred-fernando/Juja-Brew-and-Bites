"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

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
  const [step, setStep] = useState("menu"); // "menu", "checkout", "confirmation"
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
        .or('status.eq.available,is_available.eq.true'); // Backward compatibility for both column types
      
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

  // ── Cart Calculations ──────────────────────────────────────
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

  // ── Confirmation Screen ─────────────────────────────────────────
  if (step === "confirmation") {
    return (
      <div className="min-h-screen bg-[#F9F7F2] font-sans flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-md w-full text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="text-7xl mb-6">🎉</div>
          <h1 className="text-3xl font-black mb-3 uppercase tracking-tighter text-[#1A1A1A]">Order <span className="text-[#1EBBA3] font-light">Placed!</span></h1>
          <p className="text-gray-500 mb-2 text-sm font-bold uppercase tracking-widest">Thank you, {form.customer_name}!</p>
          <p className="text-gray-400 mb-8 text-sm">Your order has been sent to our kitchen. You'll receive updates shortly.</p>
          
          <div className="bg-white rounded-sm p-8 border border-gray-200 shadow-sm mb-8 text-left space-y-4">
            <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest border-b border-gray-100 pb-4"><span className="text-gray-400">Order ID</span><span className="text-[#1A1A1A]">{orderId?.slice(-8).toUpperCase()}</span></div>
            <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest border-b border-gray-100 pb-4"><span className="text-gray-400">Type</span><span className="text-[#1A1A1A]">{form.order_type}</span></div>
            <div className="flex justify-between items-center text-sm font-black uppercase tracking-widest pt-2"><span className="text-gray-400">Total</span><span className="text-[#1EBBA3]">₱{total.toFixed(2)}</span></div>
          </div>
          
          <div className="space-y-4">
            <Link href="/" className="block w-full py-4 bg-[#1A1A1A] text-white text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-[#1EBBA3] transition-colors text-center shadow-sm">Back to Home</Link>
            <button onClick={() => { setCart({}); setForm({ customer_name: "", customer_email: "", customer_phone: "", order_type: "Delivery", delivery_address: "", notes: "" }); setStep("menu"); }}
              className="block w-full py-4 bg-transparent border border-gray-300 text-gray-500 text-xs font-bold uppercase tracking-widest rounded-sm hover:border-[#1A1A1A] hover:text-[#1A1A1A] transition-colors text-center">
              Place Another Order
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9F7F2] font-sans">
      
      {/* Option Picker Modal */}
      {optionModal && (
        <div className="fixed inset-0 bg-[#1A1A1A]/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
            <div className="p-8 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-black text-xl uppercase tracking-tighter text-[#1A1A1A]">{optionModal.item.name}</h3>
                  <p className="text-[#1EBBA3] font-bold text-sm mt-1">₱{Number(optionModal.item.price).toFixed(2)}</p>
                </div>
                <button onClick={() => setOptionModal(null)} className="text-gray-400 hover:text-[#1A1A1A] transition-colors text-2xl">×</button>
              </div>
              {optionModal.item.description && <p className="text-gray-500 text-xs mt-3 leading-relaxed">{optionModal.item.description}</p>}
            </div>
            
            <div className="p-8">
              {(optionModal.item.option_groups || []).map((group, gi) => (
                <div key={gi} className="mb-8 last:mb-0">
                  <div className="flex items-center gap-3 mb-4">
                    <h4 className="font-bold text-[#1A1A1A] text-xs uppercase tracking-widest">{group.name}</h4>
                    {group.required && <span className="text-[9px] bg-[#1EBBA3]/10 text-[#159a85] px-2 py-0.5 rounded-sm font-bold uppercase tracking-widest">Required</span>}
                    {group.multi_select && <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Multiple</span>}
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
                          className={`w-full flex justify-between items-center px-5 py-4 rounded-sm border transition-all duration-200 ${isSelected ? "border-[#1EBBA3] bg-[#1EBBA3]/5 shadow-sm" : "border-gray-200 bg-white hover:border-[#1A1A1A]"}`}>
                          <div className="flex items-center gap-4">
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? "border-[#1EBBA3]" : "border-gray-300"}`}>
                              {isSelected && <div className="w-2 h-2 bg-[#1EBBA3] rounded-full" />}
                            </div>
                            <span className={`text-sm font-bold uppercase tracking-wide ${isSelected ? "text-[#1A1A1A]" : "text-gray-500"}`}>{optName}</span>
                          </div>
                          {optPrice > 0 && <span className="text-gray-400 text-xs font-bold">+₱{optPrice.toFixed(2)}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-gray-100 bg-gray-50 sticky bottom-0 z-10">
              <button onClick={handleAddWithOptions} className="w-full py-4 bg-[#1A1A1A] text-white text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-[#1EBBA3] transition-colors shadow-lg shadow-black/10">Add to Order</button>
            </div>
          </div>
        </div>
      )}

      {/* Top Nav */}
      <nav className="fixed top-0 w-full z-40 bg-white/95 backdrop-blur shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/"><img src={LOGO} alt="Juja" className="h-10 md:h-12 object-contain filter invert" style={{ filter: "brightness(0)" }} /></Link>
          <div className="hidden md:flex gap-8 text-gray-500 text-xs font-bold uppercase tracking-widest">
            <Link href="/" className="hover:text-[#1EBBA3] transition-colors">Home</Link>
            <Link href="/menu" className="hover:text-[#1EBBA3] transition-colors">Menu</Link>
            <Link href="/order" className="text-[#1A1A1A] border-b-2 border-[#1EBBA3] pb-1">Order</Link>
          </div>
          <div className="flex gap-4 items-center">
            {cartCount > 0 && step === "menu" && (
              <button onClick={() => setStep("checkout")}
                className="text-xs px-6 py-2.5 rounded-sm bg-[#1EBBA3] text-white font-bold uppercase tracking-widest hover:bg-[#1A1A1A] transition-colors flex items-center gap-3 shadow-md shadow-[#1EBBA3]/20">
                <span>🛒 {cartCount}</span> <span className="w-[1px] h-4 bg-white/30"></span> <span>₱{cartTotal.toFixed(2)}</span>
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
              
              <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200 px-6 py-4 shadow-sm">
                <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1">
                  <button onClick={() => setActiveCategory("All")}
                    className={`flex-shrink-0 px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${activeCategory === "All" ? "bg-[#1A1A1A] text-white shadow-md" : "bg-white border border-gray-200 text-gray-500 hover:border-[#1A1A1A] hover:text-[#1A1A1A]"}`}>
                    All Items
                  </button>
                  {categories.map(cat => (
                    <button key={cat.id} onClick={() => setActiveCategory(cat.name)}
                      className={`flex-shrink-0 px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${activeCategory === cat.name ? "bg-[#1A1A1A] text-white shadow-md" : "bg-white border border-gray-200 text-gray-500 hover:border-[#1A1A1A] hover:text-[#1A1A1A]"}`}>
                      <span className="text-sm">{cat.icon}</span> {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-6 md:p-10 max-w-5xl mx-auto">
                <h1 className="text-3xl font-black mb-8 uppercase tracking-tighter text-[#1A1A1A]">Digital <span className="text-[#1EBBA3] font-light">Menu</span></h1>
                
                {loading ? (
                  <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-gray-200 border-t-[#1EBBA3] animate-spin rounded-full"></div></div>
                ) : (
                  <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filtered.map(item => {
                      const itemEntries = cartEntries.filter(e => e.item.id === item.id);
                      const totalQty = itemEntries.reduce((s, e) => s + e.qty, 0);
                      const hasOptions = (item.option_groups || []).length > 0;
                      
                      return (
                        <div key={item.id} className="bg-white rounded-lg p-5 border border-gray-100 flex flex-col justify-between hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-1 transition-all group">
                          <div>
                            <div className="flex justify-between items-start mb-3">
                              <h3 className="font-bold text-[#1A1A1A] text-sm uppercase tracking-wide leading-tight group-hover:text-[#1EBBA3] transition-colors">{item.name}</h3>
                              <span className="text-[#1A1A1A] font-black text-sm ml-3 flex-shrink-0 bg-gray-50 px-2 py-1 rounded-sm">₱{Number(item.price).toFixed(2)}</span>
                            </div>
                            <p className="text-gray-400 text-xs mt-1 mb-4 leading-relaxed line-clamp-2">{item.description}</p>
                            {hasOptions && (
                              <p className="text-[9px] text-gray-400 mb-4 font-bold uppercase tracking-widest">⚙ Customizable Options</p>
                            )}
                          </div>
                          
                          <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between">
                            {totalQty > 0 && !hasOptions ? (
                              <div className="flex items-center gap-3 bg-gray-50 rounded-sm p-1">
                                <button onClick={() => decreaseCart(cartKey(item.id, []))} className="w-8 h-8 bg-white border border-gray-200 rounded-sm text-[#1A1A1A] hover:bg-gray-100 transition flex items-center justify-center font-bold shadow-sm">−</button>
                                <span className="text-[#1A1A1A] font-black text-sm min-w-[20px] text-center">{totalQty}</span>
                                <button onClick={() => increaseCart(cartKey(item.id, []))} className="w-8 h-8 bg-[#1EBBA3] rounded-sm text-white hover:bg-[#159a85] transition flex items-center justify-center font-bold shadow-sm">+</button>
                              </div>
                            ) : (
                              <button onClick={() => handleDirectAdd(item)}
                                className="w-full py-2.5 bg-white border-2 border-[#1A1A1A] text-[#1A1A1A] rounded-sm text-[10px] font-bold uppercase tracking-widest hover:bg-[#1A1A1A] hover:text-white transition-colors">
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
            <div className="w-[380px] border-l border-gray-200 bg-white flex-col hidden lg:flex shadow-xl z-40">
              <div className="p-6 border-b border-gray-100 bg-[#F9F7F2]">
                <h2 className="font-black text-[#1A1A1A] text-xl uppercase tracking-tighter mb-4">Your <span className="text-[#1EBBA3] font-light">Order</span></h2>
                <div className="flex gap-2 p-1 bg-white border border-gray-200 rounded-sm">
                  {["Delivery", "Pickup"].map(t => (
                    <button key={t} onClick={() => setForm(f => ({ ...f, order_type: t }))}
                      className={`flex-1 py-2 rounded-sm text-[10px] font-bold uppercase tracking-widest transition-all ${form.order_type === t ? "bg-[#1A1A1A] text-white shadow-sm" : "text-gray-500 hover:text-[#1A1A1A]"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 bg-white hide-scrollbar">
                {cartEntries.length === 0 ? (
                  <div className="text-center text-gray-400 py-20">
                    <div className="text-4xl mb-4 opacity-30">🛒</div>
                    <p className="text-xs font-bold uppercase tracking-widest">Cart is empty</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {cartEntries.map(entry => (
                      <div key={entry.key} className="border-b border-gray-100 pb-6 last:border-0 last:pb-0">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1 pr-4">
                            <p className="text-sm text-[#1A1A1A] font-bold uppercase tracking-wide leading-tight">{entry.item.name}</p>
                            {entry.selectedOptions?.length > 0 && (
                              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1.5">{entry.selectedOptions.map(o => o.choice).join(", ")}</p>
                            )}
                            <p className="text-xs text-[#1EBBA3] font-bold mt-1.5">₱{entry.unitPrice?.toFixed(2)}</p>
                          </div>
                          <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-sm border border-gray-100">
                            <button onClick={() => decreaseCart(entry.key)} className="w-6 h-6 bg-white border border-gray-200 rounded-sm text-gray-600 text-xs flex items-center justify-center hover:text-red-500 hover:border-red-200 transition-colors shadow-sm">−</button>
                            <span className="text-[#1A1A1A] text-xs font-black w-4 text-center">{entry.qty}</span>
                            <button onClick={() => increaseCart(entry.key)} className="w-6 h-6 bg-[#1A1A1A] rounded-sm text-xs text-white flex items-center justify-center hover:bg-[#1EBBA3] transition-colors shadow-sm">+</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {cartEntries.length > 0 && (
                <div className="p-6 border-t border-gray-200 bg-[#F9F7F2]">
                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-widest"><span>Subtotal</span><span className="text-[#1A1A1A]">₱{cartTotal.toFixed(2)}</span></div>
                    <div className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-widest"><span>Tax (10%)</span><span className="text-[#1A1A1A]">₱{tax.toFixed(2)}</span></div>
                    {form.order_type === "Delivery" && <div className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-widest"><span>Delivery</span><span className="text-[#1A1A1A]">₱150.00</span></div>}
                  </div>
                  <div className="flex justify-between items-center mb-6 pt-4 border-t border-gray-300">
                    <span className="font-black text-lg uppercase tracking-tighter text-[#1A1A1A]">Total</span>
                    <span className="text-2xl font-black text-[#1EBBA3]">₱{total.toFixed(2)}</span>
                  </div>
                  <button onClick={() => setStep("checkout")} className="w-full py-4 bg-[#1A1A1A] text-white text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-[#1EBBA3] transition-colors shadow-xl shadow-black/10">
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
            <button onClick={() => setStep("checkout")} className="w-full py-4 bg-[#1A1A1A] text-white font-bold rounded-sm hover:bg-[#1EBBA3] transition-colors shadow-2xl flex items-center justify-between px-6 border border-gray-700">
              <span className="text-xs uppercase tracking-widest">🛒 {cartCount} items</span>
              <span className="text-sm tracking-widest">Checkout · ₱{total.toFixed(2)}</span>
            </button>
          </div>
        )}

        {/* Checkout Screen */}
        {step === "checkout" && (
          <div className="max-w-6xl mx-auto px-6 py-12 grid lg:grid-cols-5 gap-12 animate-in fade-in duration-500">
            <div className="lg:col-span-3 order-2 lg:order-1">
              <button onClick={() => setStep("menu")} className="text-gray-400 hover:text-[#1A1A1A] transition-colors mb-8 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">← Back to Menu</button>
              
              <div className="bg-white p-8 md:p-12 rounded-lg border border-gray-200 shadow-sm">
                <h2 className="text-2xl font-black mb-8 uppercase tracking-tighter text-[#1A1A1A]">Checkout <span className="text-[#1EBBA3] font-light">Details</span></h2>
                
                <form onSubmit={handleCheckout} className="space-y-6">
                  
                  {/* Mobile Order Type Toggle */}
                  <div className="lg:hidden flex gap-2 p-1 bg-[#F9F7F2] border border-gray-200 rounded-sm mb-6">
                    {["Delivery", "Pickup"].map(type => (
                      <button key={type} type="button" onClick={() => setForm(f => ({ ...f, order_type: type }))}
                        className={`flex-1 py-3 rounded-sm text-[10px] font-bold uppercase tracking-widest transition-all ${form.order_type === type ? "bg-[#1A1A1A] text-white shadow-sm" : "text-gray-500 hover:text-[#1A1A1A]"}`}>
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
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{f.label}</label>
                        <input required type={f.type} value={form[f.field]} onChange={e => setForm({ ...form, [f.field]: e.target.value })}
                          className="w-full bg-[#F9F7F2] border border-gray-200 rounded-sm px-4 py-4 text-[#1A1A1A] text-sm font-bold placeholder-gray-300 focus:outline-none focus:border-[#1EBBA3] focus:ring-1 focus:ring-[#1EBBA3] transition-all"
                          placeholder={f.placeholder} />
                      </div>
                    ))}
                  </div>
                  
                  {form.order_type === "Delivery" && (
                    <div className="animate-in fade-in slide-in-from-top-4 duration-300 pt-2">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Delivery Address *</label>
                      <input required type="text" value={form.delivery_address} onChange={e => setForm({ ...form, delivery_address: e.target.value })}
                        className="w-full bg-[#F9F7F2] border border-gray-200 rounded-sm px-4 py-4 text-[#1A1A1A] text-sm font-bold placeholder-gray-300 focus:outline-none focus:border-[#1EBBA3] focus:ring-1 focus:ring-[#1EBBA3] transition-all"
                        placeholder="House No., Street, Barangay, City" />
                    </div>
                  )}
                  
                  <div className="pt-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Special Instructions</label>
                    <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3}
                      className="w-full bg-[#F9F7F2] border border-gray-200 rounded-sm px-4 py-4 text-[#1A1A1A] text-sm font-bold placeholder-gray-300 focus:outline-none focus:border-[#1EBBA3] focus:ring-1 focus:ring-[#1EBBA3] transition-all resize-none"
                      placeholder="Allergies, preferences, or special requests..." />
                  </div>
                  
                  {error && <div className="bg-red-50 border-l-4 border-red-500 rounded-r-sm px-4 py-3 text-red-600 text-[10px] font-bold uppercase tracking-widest mt-4">{error}</div>}
                  
                  <div className="pt-6 mt-6 border-t border-gray-100">
                    <button type="submit" disabled={submitting}
                      className="w-full py-5 bg-[#1A1A1A] text-white text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-[#1EBBA3] hover:-translate-y-0.5 transition-all shadow-xl shadow-black/10 disabled:opacity-50 disabled:hover:translate-y-0 flex items-center justify-center gap-3">
                      {submitting ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span> : `Confirm Order · ₱${total.toFixed(2)}`}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Order Summary Side (Checkout) */}
            <div className="lg:col-span-2 order-1 lg:order-2">
              <div className="bg-white rounded-lg p-8 border border-gray-200 shadow-sm sticky top-28">
                <h3 className="font-black text-xl mb-6 uppercase tracking-tighter text-[#1A1A1A]">Summary</h3>
                
                {/* Desktop Order Type Toggle inside summary */}
                <div className="hidden lg:flex gap-2 p-1 bg-[#F9F7F2] border border-gray-200 rounded-sm mb-8">
                  {["Delivery", "Pickup"].map(type => (
                    <button key={type} type="button" onClick={() => setForm(f => ({ ...f, order_type: type }))}
                      className={`flex-1 py-2.5 rounded-sm text-[10px] font-bold uppercase tracking-widest transition-all ${form.order_type === type ? "bg-[#1A1A1A] text-white shadow-sm" : "text-gray-500 hover:text-[#1A1A1A]"}`}>
                      {type}
                    </button>
                  ))}
                </div>

                <div className="space-y-4 mb-8 max-h-[40vh] overflow-y-auto pr-2 hide-scrollbar">
                  {cartEntries.map(entry => (
                    <div key={entry.key} className="text-sm border-b border-gray-50 pb-4 last:border-0 last:pb-0">
                      <div className="flex justify-between items-start">
                        <div className="flex gap-3">
                          <span className="text-[#1EBBA3] font-black">{entry.qty}×</span>
                          <span className="font-bold text-[#1A1A1A] uppercase tracking-wide">{entry.item.name}</span>
                        </div>
                        <span className="text-[#1A1A1A] font-bold ml-4 text-xs">₱{(entry.unitPrice * entry.qty).toFixed(2)}</span>
                      </div>
                      {entry.selectedOptions?.length > 0 && (
                        <p className="ml-7 text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1.5">{entry.selectedOptions.map(o => o.choice).join(", ")}</p>
                      )}
                    </div>
                  ))}
                </div>
                
                <div className="border-t border-gray-200 pt-6 space-y-3">
                  <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase tracking-widest"><span>Subtotal</span><span className="text-[#1A1A1A]">₱{cartTotal.toFixed(2)}</span></div>
                  <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase tracking-widest"><span>Tax (10%)</span><span className="text-[#1A1A1A]">₱{tax.toFixed(2)}</span></div>
                  {form.order_type === "Delivery" && <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase tracking-widest"><span>Delivery Fee</span><span className="text-[#1A1A1A]">₱150.00</span></div>}
                  <div className="flex justify-between items-end pt-4 mt-4 border-t border-gray-200">
                    <span className="text-sm font-black uppercase tracking-widest text-[#1A1A1A]">Total</span>
                    <span className="text-2xl font-black text-[#1EBBA3]">₱{total.toFixed(2)}</span>
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