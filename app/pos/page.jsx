"use client";

import { useState, useEffect } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { createBrowserClient } from "@/lib/supabase/client";

export default function POSPage() {
  const supabase = createBrowserClient();

  // =====================
  // STATE
  // =====================
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [diningOptions, setDiningOptions] = useState([]);

  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeCategory, setActiveCategory] = useState("ALL");

  const [attachedCustomer, setAttachedCustomer] = useState(null);
  const [orderType, setOrderType] = useState("");

  const [scannerOpen, setScannerOpen] = useState(false);

  // =====================
  // LOAD DATA
  // =====================
  useEffect(() => {
    async function load() {
      setLoading(true);

      const [menuRes, catRes, custRes, dineRes] = await Promise.all([
        supabase.from("menu_items").select("*").eq("is_available", true),
        supabase.from("menu_categories").select("*"),
        supabase.from("loyalty_members").select("id, customer_name, customer_code"),
        supabase.from("dining_options").select("*"),
      ]);

      setItems(menuRes.data || []);
      setCategories(catRes.data || []);
      setCustomers(custRes.data || []);
      setDiningOptions(dineRes.data || []);

      setLoading(false);
    }

    load();
  }, []);

  // =====================
  // CART
  // =====================
  const addToCart = (item) => {
    setCart((prev) => [
      ...prev,
      {
        ...item,
        cartId: Date.now(),
        qty: 1,
      },
    ]);
  };

  const updateQty = (id, qty) => {
    setCart((prev) =>
      prev.map((i) => (i.cartId === id ? { ...i, qty } : i))
    );
  };

  const removeItem = (id) => {
    setCart((prev) => prev.filter((i) => i.cartId !== id));
  };

  const subtotal = cart.reduce(
    (sum, i) => sum + Number(i.price) * i.qty,
    0
  );

  // =====================
  // PLACE ORDER
  // =====================
  const placeOrder = async () => {
    if (!cart.length) return;

    await supabase.from("open_tickets").insert({
      customer_id: attachedCustomer?.id || null,
      items: cart,
      total_amount: subtotal,
      order_type: orderType,
      status: "open",
    });

    setCart([]);
    setAttachedCustomer(null);
  };

  // =====================
  // SCANNER (FIXED)
  // =====================
  useEffect(() => {
    if (!scannerOpen) return;

    const scanner = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: 250 },
      false
    );

    scanner.render(
      (decodedText) => {
        const code = decodedText.trim();

        const customer = customers.find(
          (c) => c.customer_code === code
        );

        if (customer) {
          setAttachedCustomer(customer);
        } else {
          alert("Customer not found");
        }

        setScannerOpen(false);
        scanner.clear();
      },
      () => {}
    );

    return () => scanner.clear().catch(() => {});
  }, [scannerOpen, customers]);

  // =====================
  // LOADING
  // =====================
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        Loading POS...
      </div>
    );
  }

  // =====================
  // UI
  // =====================
  return (
    <div className="flex h-screen bg-white overflow-hidden">

      {/* =====================
          MENU
      ===================== */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setScannerOpen(true)}
            className="bg-black text-white px-3 py-2 rounded"
          >
            Scan Customer
          </button>

          <select
            value={activeCategory}
            onChange={(e) => setActiveCategory(e.target.value)}
            className="border px-2"
          >
            <option value="ALL">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {items
            .filter(
              (i) =>
                activeCategory === "ALL" ||
                i.category === activeCategory
            )
            .map((item) => (
              <button
                key={item.id}
                onClick={() => addToCart(item)}
                className="border p-3 rounded"
              >
                <div className="font-bold">{item.name}</div>
                <div>₱{item.price}</div>
              </button>
            ))}
        </div>
      </div>

      {/* =====================
          CART
      ===================== */}
      <div className="w-[350px] border-l p-4 flex flex-col">
        <h2 className="font-bold mb-2">
          {attachedCustomer
            ? attachedCustomer.customer_name
            : "Walk-in"}
        </h2>

        <div className="flex-1 overflow-y-auto space-y-2">
          {cart.map((item) => (
            <div key={item.cartId} className="border p-2">
              <div className="flex justify-between">
                <b>{item.name}</b>
                <button onClick={() => removeItem(item.cartId)}>
                  x
                </button>
              </div>

              <div className="text-sm">
                ₱{item.price}
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  onClick={() =>
                    updateQty(
                      item.cartId,
                      Math.max(1, item.qty - 1)
                    )
                  }
                >
                  -
                </button>
                <span>{item.qty}</span>
                <button
                  onClick={() =>
                    updateQty(item.cartId, item.qty + 1)
                  }
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* TOTAL */}
        <div className="border-t pt-2">
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span>₱{subtotal}</span>
          </div>

          <button
            onClick={placeOrder}
            className="w-full bg-green-500 text-white p-2 mt-2"
          >
            Charge Order
          </button>
        </div>
      </div>

      {/* =====================
          SCANNER UI
      ===================== */}
      {scannerOpen && (
        <div className="fixed inset-0 bg-black z-[999] flex flex-col">
          <div className="p-4 text-white flex justify-between">
            <h2>Scan Customer</h2>
            <button onClick={() => setScannerOpen(false)}>
              ✕
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center">
            <div id="reader" className="w-full max-w-md" />
          </div>
        </div>
      )}
    </div>
  );
}