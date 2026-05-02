"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { MenuItem, Order, MenuCategory } from "@/api/entities";

export default function OrderPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState("menu"); // menu | checkout | success
  const [form, setForm] = useState({
    customer_name: "", customer_phone: "",
    order_type: "Pickup", delivery_address: "", notes: ""
  });

  useEffect(() => {
    Promise.all([
      MenuItem.filter({ is_available: true }),
      MenuCategory.list()
    ]).then(([menuData, catData]) => {
      setItems(menuData);
      setCategories(catData.filter(c => c.is_active).sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99)));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const addToCart = (item) => {
    setCart([...cart, { ...item, cartId: Math.random() }]);
  };

  const removeFromCart = (cartId) => {
    setCart(cart.filter(i => i.cartId !== cartId));
  };

  const total = cart.reduce((sum, item) => sum + item.price, 0);

  const handleCheckout = async (e) => {
    e.preventDefault();
    try {
      const orderData = {
        ...form,
        items: cart.map(i => ({ id: i.id, name: i.name, price: i.price })),
        total_amount: total,
        status: "Pending",
        payment_status: "Unpaid"
      };
      await Order.create(orderData);
      setStep("success");
      setCart([]);
    } catch (err) {
      alert("Error placing order. Please try again.");
    }
  };

  if (step === "success") {
    return (
      <div className="min-h-screen bg-brand-light flex items-center justify-center p-6">
        <div className="bg-white p-8 border border-brand-teal text-center max-w-sm">
          <h1 className="text-3xl font-bold text-brand-teal mb-4">Order Received!</h1>
          <p className="text-gray-600 mb-6">Thanks, {form.customer_name}. We're getting your cookies ready!</p>
          <Link href="/" className="block w-full py-3 bg-brand-teal text-white font-bold uppercase text-sm tracking-widest">Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-light text-brand-dark">
      {/* Simple Header */}
      <nav className="bg-white border-b border-brand-gray p-4 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="font-bold text-brand-teal text-xl">Juja Brew & Bites</Link>
          <div className="font-bold text-sm">🛒 {cart.length} Items</div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto p-6 grid lg:grid-cols-3 gap-8">
        {/* Menu Section */}
        <div className="lg:col-span-2">
          <div className="flex gap-2 overflow-x-auto mb-6 pb-2">
            <button onClick={() => setActiveCategory("All")} className={`px-4 py-2 text-xs font-bold uppercase border ${activeCategory === "All" ? "bg-brand-teal text-white border-brand-teal" : "bg-white border-brand-gray"}`}>All</button>
            {categories.map(cat => (
              <button key={cat.id} onClick={() => setActiveCategory(cat.name)} className={`px-4 py-2 text-xs font-bold uppercase border ${activeCategory === cat.name ? "bg-brand-teal text-white border-brand-teal" : "bg-white border-brand-gray"}`}>{cat.icon} {cat.name}</button>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {items.filter(i => activeCategory === "All" || i.category === activeCategory).map(item => (
              <div key={item.id} className="bg-white border border-brand-gray p-4 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-lg">{item.name}</h3>
                  <p className="text-gray-500 text-sm mb-4">{item.description}</p>
                </div>
                <div className="flex justify-between items-center mt-4">
                  <span className="font-bold text-brand-teal">₱{item.price.toFixed(2)}</span>
                  <button onClick={() => addToCart(item)} className="bg-brand-dark text-white px-4 py-2 text-xs font-bold uppercase hover:bg-brand-teal transition">Add +</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cart/Checkout Section */}
        <div className="bg-white border border-brand-gray p-6 h-fit sticky top-24">
          <h2 className="font-bold text-xl mb-4 uppercase tracking-tight">Your Order</h2>
          {cart.length === 0 ? (
            <p className="text-gray-400 text-sm italic">Your cart is empty.</p>
          ) : (
            <>
              <div className="space-y-4 mb-6">
                {cart.map(i => (
                  <div key={i.cartId} className="flex justify-between text-sm border-b border-brand-light pb-2">
                    <span>{i.name}</span>
                    <div className="flex gap-4">
                      <span className="font-bold">₱{i.price.toFixed(2)}</span>
                      <button onClick={() => removeFromCart(i.cartId)} className="text-red-500">✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-bold text-lg mb-6 border-t border-brand-gray pt-4">
                <span>Total</span>
                <span className="text-brand-teal">₱{total.toFixed(2)}</span>
              </div>
              
              <form onSubmit={handleCheckout} className="space-y-3">
                <input required placeholder="Name" className="w-full border border-brand-gray p-3 text-sm focus:border-brand-teal outline-none" value={form.customer_name} onChange={e => setForm({...form, customer_name: e.target.value})} />
                <input required placeholder="Phone Number" className="w-full border border-brand-gray p-3 text-sm focus:border-brand-teal outline-none" value={form.customer_phone} onChange={e => setForm({...form, customer_phone: e.target.value})} />
                <select className="w-full border border-brand-gray p-3 text-sm focus:border-brand-teal outline-none" value={form.order_type} onChange={e => setForm({...form, order_type: e.target.value})}>
                  <option>Pickup</option>
                  <option>Delivery</option>
                </select>
                <button className="w-full py-4 bg-brand-teal text-white font-bold uppercase text-sm tracking-widest hover:bg-teal-600 transition">Place Order</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}