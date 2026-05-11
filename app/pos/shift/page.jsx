"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function CashierShiftPage() {
  const [shift, setShift] = useState(null);
  const [loading, setLoading] = useState(true);

  const [cashInAmount, setCashInAmount] = useState("");
  const [cashOutAmount, setCashOutAmount] = useState("");
  const [note, setNote] = useState("");

  const [ordersTotal, setOrdersTotal] = useState(0);

  // -----------------------------
  // LOAD SHIFT
  // -----------------------------
  const loadShift = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    const { data } = await supabase
      .from("cashier_shifts")
      .select("*")
      .eq("cashier_id", user?.id)
      .eq("status", "open")
      .single();

    setShift(data || null);
    setLoading(false);
  };

  // -----------------------------
  // CALCULATE SALES FROM ORDERS
  // -----------------------------
  const calculateSales = async () => {
    const { data } = await supabase
      .from("open_tickets_order")
      .select("total");

    const total = (data || []).reduce(
      (sum, o) => sum + parseFloat(o.total || 0),
      0
    );

    setOrdersTotal(total);
  };

  // -----------------------------
  // OPEN SHIFT
  // -----------------------------
  const openShift = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    const { error } = await supabase.from("cashier_shifts").insert({
      cashier_id: user.id,
      cashier_name: user.email,
      status: "open",
      cash_in: 0,
    });

    if (!error) loadShift();
  };

  // -----------------------------
  // CASH IN
  // -----------------------------
  const cashIn = async () => {
    if (!cashInAmount) return;

    await supabase.from("cash_transactions").insert({
      shift_id: shift.id,
      type: "cash_in",
      amount: parseFloat(cashInAmount),
      note,
    });

    await supabase
      .from("cashier_shifts")
      .update({
        cash_in: shift.cash_in + parseFloat(cashInAmount),
      })
      .eq("id", shift.id);

    setCashInAmount("");
    setNote("");
    loadShift();
  };

  // -----------------------------
  // CASH OUT
  // -----------------------------
  const cashOut = async () => {
    if (!cashOutAmount) return;

    await supabase.from("cash_transactions").insert({
      shift_id: shift.id,
      type: "cash_out",
      amount: parseFloat(cashOutAmount),
      note,
    });

    await supabase
      .from("cashier_shifts")
      .update({
        cash_out: shift.cash_out + parseFloat(cashOutAmount),
      })
      .eq("id", shift.id);

    setCashOutAmount("");
    setNote("");
    loadShift();
  };

  // -----------------------------
  // CLOSE SHIFT
  // -----------------------------
  const closeShift = async () => {
    const expected = shift.cash_in + ordersTotal - shift.cash_out;

    const actual = parseFloat(prompt("Enter actual cash count:"));

    const diff = actual - expected;

    await supabase
      .from("cashier_shifts")
      .update({
        status: "closed",
        expected_cash: expected,
        actual_cash: actual,
        difference: diff,
        closed_at: new Date(),
      })
      .eq("id", shift.id);

    loadShift();
  };

  // -----------------------------
  // INIT
  // -----------------------------
  useEffect(() => {
    loadShift();
    calculateSales();
  }, []);

  // -----------------------------
  // LOADING
  // -----------------------------
  if (loading) {
    return (
      <div className="p-10 text-center">
        Loading shift...
      </div>
    );
  }

  // -----------------------------
  // NO SHIFT
  // -----------------------------
  if (!shift) {
    return (
      <div className="p-10 text-center">
        <h1 className="text-xl font-bold mb-4">No Active Shift</h1>

        <button
          onClick={openShift}
          className="bg-green-500 text-white px-4 py-2 rounded"
        >
          Open Shift
        </button>
      </div>
    );
  }

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div className="p-6 bg-gray-50 min-h-screen">

      <h1 className="text-2xl font-bold mb-6">
        💰 Cashier Shift System
      </h1>

      {/* SHIFT INFO */}
      <div className="bg-white p-4 rounded shadow mb-4">
        <p><b>Status:</b> {shift.status}</p>
        <p><b>Cash In:</b> ₱{shift.cash_in}</p>
        <p><b>Cash Out:</b> ₱{shift.cash_out}</p>
        <p><b>Sales:</b> ₱{ordersTotal}</p>
      </div>

      {/* CASH IN / OUT */}
      <div className="grid grid-cols-2 gap-4 mb-4">

        <div className="bg-white p-4 rounded shadow">
          <h2 className="font-bold mb-2">Cash In</h2>

          <input
            className="border p-2 w-full mb-2"
            placeholder="Amount"
            value={cashInAmount}
            onChange={(e) => setCashInAmount(e.target.value)}
          />

          <button
            onClick={cashIn}
            className="bg-blue-500 text-white px-3 py-1 rounded"
          >
            Add Cash
          </button>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <h2 className="font-bold mb-2">Cash Out</h2>

          <input
            className="border p-2 w-full mb-2"
            placeholder="Amount"
            value={cashOutAmount}
            onChange={(e) => setCashOutAmount(e.target.value)}
          />

          <button
            onClick={cashOut}
            className="bg-red-500 text-white px-3 py-1 rounded"
          >
            Remove Cash
          </button>
        </div>

      </div>

      {/* NOTE */}
      <div className="bg-white p-4 rounded shadow mb-4">
        <input
          className="border p-2 w-full"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {/* CLOSE SHIFT */}
      <button
        onClick={closeShift}
        className="bg-black text-white px-4 py-2 rounded"
      >
        Close Shift
      </button>

    </div>
  );
}