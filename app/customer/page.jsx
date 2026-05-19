{/* TAB CONTENT RENDER */}
{tab === "home" && (
  <div className="p-4">
    <h2 className="text-lg font-semibold text-slate-800">Menu</h2>
    <p className="text-sm text-slate-500 mt-1">
      Your menu will show here.
    </p>

    {/* ✅ Example placeholder */}
    <div className="mt-4 space-y-2">
      <div className="p-4 bg-white rounded-xl border">☕ Coffee</div>
      <div className="p-4 bg-white rounded-xl border">🍔 Burger</div>
      <div className="p-4 bg-white rounded-xl border">🍰 Desserts</div>
    </div>
  </div>
)}

{tab === "order" && (
  <div className="p-4">
    <h2 className="text-lg font-semibold text-slate-800">Order</h2>
    <p className="text-sm text-slate-500 mt-1">
      Place your order here.
    </p>

    {/* ✅ Example placeholder */}
    <button className="mt-4 w-full py-3 rounded-xl bg-[#FC687D] text-white">
      Start Ordering
    </button>
  </div>
)}

{tab === "loyalty" && (
  <div className="p-4">
    <h2 className="text-lg font-semibold text-slate-800">Loyalty</h2>
    <p className="text-sm text-slate-500 mt-1">
      Points and rewards will appear here.
    </p>
  </div>
)}

{tab === "booking" && (
