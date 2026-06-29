"use client";

import { useState, useMemo } from "react";

export default function TicketPanel({
  cart = [],
  handleCodeInput,
  customers,
  customerSearch,
  setCustomerSearch,
  onSearchKeyDown,
  onOpenScanner,
  diningOption,
  diningOptions,
  setDiningOption,
  grabOrderNumber = "",
  setGrabOrderNumber,
  showGrabOrderNumber = false,
  subtotal = 0,
  attachedCustomer,
  onRemoveCustomer,
  onChangeCustomer,
  onViewCustomer,
  appliedVoucher,
  onOpenVouchers,
  onRemoveVoucher,
  discountRules = [],
  appliedDiscount = null,
  onApplyDiscount,
  onRemoveDiscount,
  onCharge,
  onSave,
  onPrintBill,
  onVoidLiveTicket,
  charging,
  savingTicket,
  splitMode,
  splitSelected = [],
  onToggleSplit,
  onMoveToNewTicket,
  onMoveToSaved,
  onOpenWebOrdersModal,
  onOpenSavedTicketsModal,
  onCartItemClick,
  onRemoveCartItem,
  onCloseMobile,
  onOpenPosMenu,
  pendingCount = 0,
  ticketTitle,
}) {
  const [showManageDropdown, setShowManageDropdown] = useState(false);

  const lineGrossAmount = (line) =>
    Number(line?.unitPrice || line?.price || 0) * Number(line?.quantity || line?.qty || 0);
  const lineDiscountAmount = (line) =>
    Math.max(0, Math.min(lineGrossAmount(line), Number(line?.discountAmount || line?.discount_amount || 0)));
  const lineNetAmount = (line) => Math.max(0, lineGrossAmount(line) - lineDiscountAmount(line));

  /* ✅ FIX: find selected dining option (ID → name mapping) */
  const selectedDining = useMemo(() => {
    return diningOptions.find((d) => d.id === diningOption);
  }, [diningOptions, diningOption]);

  /* ✅ customer suggestions */
  const suggestions =
    customerSearch.length > 1
      ? customers
          .filter(
            (c) =>
              c.name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
              c.code?.toLowerCase().includes(customerSearch.toLowerCase())
          )
          .slice(0, 6)
      : [];

  return (
    <div className="flex flex-col h-full min-h-0 text-slate-800 font-sans select-none bg-white p-3 rounded-xl border border-slate-100 shadow-sm">

      {/* Header */}
      <div className="pb-3 mb-3 border-b border-rose-100 space-y-3">
        <div className="flex items-center justify-between">
        <div className="text-left">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Active Station
          </span>

          {/* ✅ FIX: show name instead of ID */}
          <h2 className="text-xl font-bold tracking-tight text-slate-800 mt-0.5">
            {ticketTitle || selectedDining?.name || "Select Table"}
          </h2>

          <p
            className={`text-xs font-semibold mt-0.5 ${
              attachedCustomer ? "text-rose-500" : "text-slate-400"
            }`}
          >
            {attachedCustomer
              ? `👤 ${attachedCustomer.name || attachedCustomer.customer_name}`
              : "Walk-in Guest"}
          </p>
          {attachedCustomer && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={onViewCustomer || onChangeCustomer}
                className="px-2.5 py-1 rounded-full border border-slate-200 bg-white text-[10px] font-semibold uppercase tracking-wide text-slate-700 hover:bg-slate-50 transition"
              >
                View Account
              </button>
              <button
                type="button"
                onClick={onRemoveCustomer}
                className="px-2.5 py-1 rounded-full border border-rose-100 bg-rose-50 text-[10px] font-semibold uppercase tracking-wide text-rose-700 hover:bg-rose-100 transition"
              >
                Remove
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
        {onOpenPosMenu && (
          <button
            type="button"
            onClick={onOpenPosMenu}
            className="relative h-9 px-3 rounded-xl bg-slate-100/78 text-white text-[12px] font-semibold uppercase shadow-sm"
          >
            ☰
            {pendingCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 rounded-full bg-white border border-rose-100 text-[#FC687D] text-[9px] flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </button>
        )}
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition"
          >
            ✕
          </button>
        )}
        </div>
        </div>
      </div>

      {/* Customer Search */}
      <div className="relative flex gap-2 mb-3">
        <input
          value={customerSearch}
          onChange={(e) => setCustomerSearch(e.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="Search customer or scan..."
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
        />

        <button
          onClick={onOpenScanner}
          className="bg-slate-50 rounded-xl"
        >
          📷
        </button>

        {suggestions.length > 0 && (
          <div className="absolute left-0 right-12 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
            {suggestions.map((c) => (
              <button
                key={c.id}
                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50"
                onClick={() => {
                  handleCodeInput(c.name);
                  setCustomerSearch("");
                }}
              >
                {c.name} <span className="text-slate-400">({c.code})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ✅ Repaired Dining Options Dropdown Component */}
      <div className="flex-none pb-3 mb-3 border-b border-slate-100">
        <label className="block text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1.5">
          Serving Destination
        </label>
        <select
          value={diningOption || ""}
          onChange={(e) => {
            const selectedValue = e.target.value;
            setDiningOption(selectedValue);
          }}
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 tracking-wide outline-none focus:border-rose-200 transition"
        >
          <option value="" disabled>
            Select Dining Option
          </option>

          {/* ✅ Direct mapping against pre-filtered database arrays to circumvent schema field mismatches */}
          {Array.isArray(diningOptions) && diningOptions.length > 0 ? (
            diningOptions.map((opt) => (
              <option key={String(opt.id)} value={String(opt.id)}>
                {opt.name}
              </option>
            ))
          ) : (
            <option disabled value="">
              ⚠️ No options loaded (Check Admin Settings)
            </option>
          )}
        </select>
        {showGrabOrderNumber && (
          <label className="mt-2 block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
              GRAB Order Number
            </span>
            <div className="flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100">
              <span className="mr-2 shrink-0 text-xs font-black uppercase tracking-wide text-slate-500">GRAB</span>
              <input
                value={grabOrderNumber}
                onChange={(event) => setGrabOrderNumber?.(event.target.value.replace(/[^\w-]/g, ""))}
                placeholder="335"
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-300"
              />
            </div>
          </label>
        )}
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-2 mb-3 relative z-30">
        <button
          onClick={() =>
            appliedVoucher ? onRemoveVoucher() : onOpenVouchers()
          }
          className={`py-2 rounded-xl border text-xs font-semibold flex items-center justify-center ${
            appliedVoucher
              ? "border-rose-200 bg-rose-50 text-rose-600"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          🎟️ {appliedVoucher ? "Remove Voucher" : "Apply Voucher"}
        </button>

        <div className="relative">
          <button
            onClick={() => setShowManageDropdown((p) => !p)}
            className="w-full py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 tracking-wide transition flex items-center justify-center gap-1.5 active:scale-95"
          >
            ⚙️ Manage Ticket ▾
          </button>

          {showManageDropdown && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden py-1 z-50">
              
              {/* ✅ ADDED: View Parked Web Orders Entry Point */}
              <button
                onClick={() => { setShowManageDropdown(false); onOpenWebOrdersModal(); }}
                className="w-full text-left px-4 py-2.5 text-xs font-bold text-rose-600 bg-rose-50/40 hover:bg-rose-50 transition flex items-center gap-2"
              >
                🌐 View Accepted Web Orders
              </button>
              
              <button
                onClick={() => { setShowManageDropdown(false); onPrintBill?.(); }}
                disabled={cart.length === 0}
                className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition flex items-center gap-2"
              >
                Print Bill
              </button>
              
              <div className="border-t border-slate-100 my-1" />

              <button
                onClick={() => { setShowManageDropdown(false); onOpenSavedTicketsModal(); }}
                className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition flex items-center gap-2"
              >
                📋 View Saved Tickets
              </button>
              
              <div className="border-t border-slate-100 my-1" />
              <button
                onClick={() => { setShowManageDropdown(false); onToggleSplit(); }}
                className={`w-full text-left px-4 py-2.5 text-xs font-medium hover:bg-slate-50 transition flex items-center gap-2 ${
                  splitMode ? "text-amber-600 bg-amber-50/50" : "text-slate-700"
                }`}
              >
                {splitMode ? "🚫 Disable Selection Mode" : "✂️ Split Ticket Lines"}
              </button>
              <button
                onClick={() => { setShowManageDropdown(false); onMoveToSaved(); }}
                disabled={cart.length === 0}
                className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition flex items-center gap-2"
              >
                📥 Shift items to Saved
              </button>
              <button
                onClick={() => { setShowManageDropdown(false); onMoveToNewTicket(); }}
                disabled={cart.length === 0}
                className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition flex items-center gap-2"
              >
                🪑 Shift items to Alternate Table
              </button>
              <div className="border-t border-slate-100 my-1" />
              <button
                onClick={() => { setShowManageDropdown(false); onVoidLiveTicket(); }}
                disabled={cart.length === 0}
                className="w-full text-left px-4 py-2.5 text-xs font-bold text-red-500 hover:bg-red-50 transition disabled:opacity-40 flex items-center gap-2"
              >
                🗑️ Void Live Ticket
              </button>
            </div>
          )}
        </div>
      </div>

      {discountRules.length > 0 && (
        <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50/70 p-2">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Order Discount
          </label>
          <div className="flex gap-2">
            <select
              value={appliedDiscount?.id || ""}
              onChange={(event) => {
                const selected = discountRules.find((rule) => String(rule.id) === String(event.target.value));
                if (selected) onApplyDiscount?.(selected);
                else onRemoveDiscount?.();
              }}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-slate-400"
            >
              <option value="">No order discount</option>
              {discountRules.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.name || rule.discount_name || "Discount"}
                </option>
              ))}
            </select>
            {appliedDiscount && (
              <button
                type="button"
                onClick={onRemoveDiscount}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 transition hover:bg-slate-100"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Split Selection State Alert Strip */}
      {splitMode && (
        <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-3 py-2 text-[11px] text-center font-semibold tracking-wide animate-pulse">
          Tap elements below to link split targets ({splitSelected.length} active)
        </div>
      )}


      {/* Lightweight Transparent Feed Cart */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 border-b border-slate-100 pb-3">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 py-10">
            <span className="text-2xl mb-1.5 opacity-60">☕</span>
            <p className="text-xs font-medium tracking-wide">Workspace Empty</p>
          </div>
        ) : (
          cart.map((line, idx) => {
            const isSelectedForSplit = splitSelected.includes(line.cartItemId);
            const itemDiscount = lineDiscountAmount(line);
            return (
              <div
                key={line.cartItemId || idx}
                onClick={() => onCartItemClick(line, idx)}
                className={`p-3 rounded-xl border transition text-left cursor-pointer flex flex-col gap-1 ${
                  isSelectedForSplit
                    ? "border-amber-400 bg-amber-50/60 shadow-sm"
                    : "border-slate-100 bg-white hover:bg-slate-50/80 shadow-2n"
                }`}
              >
                <div className="flex justify-between items-baseline gap-2">
                  <p className="text-[14px] font-semibold text-slate-800 truncate">{line.name}</p>
                  <p className="text-[14px] font-bold text-slate-700 font-mono whitespace-nowrap">
                    ₱{Number(lineNetAmount(line)).toLocaleString("en-PH", { maximumFractionDigits: 0 })}
                  </p>
                </div>             
                
                

                <div className="flex justify-between items-center text-[11px]">
                  <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md font-bold font-mono text-[14px]">
                    x{line.quantity}
                  </span>
                  {line.variantDetails && (
                    <span className="italic truncate max-w-[170px] text-slate-400 font-medium">
                      {line.variantDetails}
                    </span>
                  )}

                  {onRemoveCartItem && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveCartItem(idx);
                    }}
                    className="self-end rounded-sm border border-red-200 bg-red-400 px-1.5 py-0.5 text-[10px] font-bold font-mono uppercase tracking-wide text-slate-900 transition hover:bg-red-100"
                  >
                    remove
                  </button>
                )}
                </div>
                {itemDiscount > 0 && (
                  <div className="flex justify-between rounded-lg bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-800">
                    <span>Item discount</span>
                    <span>-₱{Number(itemDiscount).toLocaleString("en-PH", { maximumFractionDigits: 0 })}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Checkout Computations Layout Footer */}
      <div className="mt-3 pt-1 space-y-3 bg-white">
        <div className="flex justify-between items-baseline">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Balance</span>
          <span className="font-bold text-2xl text-slate-800">
            ₱{Number(subtotal || 0).toLocaleString("en-PH", { maximumFractionDigits: 0 })}
          </span>
        </div>

        {/* Master Execution Action Targets */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={onSave}
            disabled={savingTicket || cart.length === 0}
            className="text-[13px] font-bold rounded-xl bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 transition disabled:opacity-40 active:scale-95"
          >
            {savingTicket ? "Saving..." : "Save Ticket"}
          </button>
          <button
            onClick={onCharge}
            disabled={charging || cart.length === 0}
            className="text-[13px] font-bold tracking-wider rounded-xl bg-[#FC687D] hover:bg-[#fa546c] text-white shadow-md shadow-rose-200 transition disabled:opacity-40 active:scale-95 flex items-center justify-center"
          >
            {charging ? "Charging..." : "Charge"}
          </button>
        </div>
      </div>
    </div>
  );
}
