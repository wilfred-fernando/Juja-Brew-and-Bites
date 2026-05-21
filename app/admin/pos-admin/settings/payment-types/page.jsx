"use client";

import { useState } from "react";

export default function Page() {
  const [types, setTypes] = useState(["Cash", "QRPH", "GrabFood"]);
  const [newType, setNewType] = useState("");

  function addType() {
    if (!newType) return;
    setTypes([...types, newType]);
    setNewType("");
  }

  return (
    <div className="p-6 space-y-4">

      <h1 className="font-bold text-lg">Payment Types</h1>

      {/* ADD */}
      <div className="flex gap-2">
        <input
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
          placeholder="Add payment type"
          className="border px-2 py-1"
        />
        <button onClick={addType} className="bg-black text-white px-3">
          Add
        </button>
      </div>

      {/* LIST */}
      {types.map((t, i) => (
        <div key={i} className="border-b py-2">
          {t}
        </div>
      ))}

    </div>
  );
}
