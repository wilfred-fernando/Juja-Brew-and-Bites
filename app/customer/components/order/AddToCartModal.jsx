"use client";

import { useEffect, useState } from "react";

export default function AddToCartModal({ item, onClose, onAddToCart }) {
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState({});
  const [instructions, setInstructions] = useState("");

  useEffect(() => {
    if (!item) return;

    // Defaults for required groups
    if (Array.isArray(item.variants)) {
      const defaults = {};
      item.variants.forEach((g) => {
        if (g.isRequired && Array.isArray(g.options) && g.options.length > 0) {
          defaults[g.id] = [g.options[0]];
        }
      });
      setSelections(defaults);
    } else {
      setSelections({});
    }

    setQuantity(1);
    setInstructions("");
  }, [item]);

  const toggleOption = (group, opt) => {
    const current = selections[group.id] || [];
    if (!group.isMultiSelect) {
      setSelections({ ...selections, [group.id]: [opt] });
    } else {
      const exists = current.find((o) => o.id === opt.id);
      setSelections({
        ...selections,
        [group.id]: exists ? current.filter((o) => o.id !== opt.id) : [...current, opt],
      });
    }
  };

  const unitPrice =
    (Number(item?.price) || 0) +
    Object.values(selections)
      .flat()
      .reduce((sum, o) => sum + (Number(o.price) || 0), 0);

  const handleAdd = () => {
    const variantText = Object.values(selections)
      .flat()
      .map((o) => o.name)
      .join(", ");

    onAddToCart({
      cartItemId: `${item.id}-${Date.now()}`,
      id: item.id,
      name: item.name,
      image_url: item.image_url || null,
      quantity,
      unitPrice,
      variantDetails: variantText,
      instructions,
    });

    onClose();
  };

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-[28px] md:rounded-[32px] p-6 md:p-7 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Add to Cart</p>
            <h3 className="text-lg md:text-xl font-semibold text-slate-900">{item.name}</h3>
            <p className="text-[12px] text-slate-500 mt-1">
              Base: ₱{Number(item.price || 0).toLocaleString()}
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Variants */}
        {Array.isArray(item.variants) && item.variants.length > 0 && (
          <div className="space-y-4 mt-4">
            {item.variants.map((g) => (
              <div key={g.id} className="border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-slate-800">
                    {g.name} {g.isRequired ? <span className="text-rose-500">*</span> : null}
                  </p>
                  <span className="text-[10px] text-slate-400">{g.isMultiSelect ? "Multi" : "Single"}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3">
                  {(g.options || []).map((opt) => {
                    const selected = (selections[g.id] || []).some((o) => o.id === opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleOption(g, opt)}
                        className={`p-3 rounded-xl border text-left transition-all active:scale-95 ${
                          selected
                            ? "bg-[#FFF1F4] border-[#FC687D]"
                            : "bg-white border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <p className="text-[11px] font-semibold text-slate-800">{opt.name}</p>
                        {Number(opt.price || 0) > 0 && (
                          <p className="text-[10px] text-slate-500 mt-1">
                            + ₱{Number(opt.price).toLocaleString()}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Instructions */}
        <div className="mt-4">
          <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">
            Special Instructions (optional)
          </label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm"
            placeholder="e.g. Less ice, no sugar, etc."
          />
        </div>

        {/* Quantity + Total */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 active:scale-95"
            >
              −
            </button>
            <div className="min-w-[48px] text-center font-semibold text-slate-800">{quantity}</div>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 active:scale-95"
            >
              +
            </button>
          </div>

          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Total</p>
            <p className="text-lg font-semibold text-slate-900">
              ₱{Number(unitPrice * quantity).toLocaleString()}
            </p>
          </div>
        </div>

        <button
          onClick={handleAdd}
          className="mt-5 w-full py-3.5 rounded-xl bg-[#FC687D] text-white font-normal text-[11px] md:text-[12px] uppercase tracking-widest hover:bg-rose-500 active:scale-95"
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
}