"use client";

import { createContext, useContext, useState } from "react";

const ShiftContext = createContext();

export function ShiftProvider({ children }) {
  const [shift, setShift] = useState(null);

  return (
    <ShiftContext.Provider value={{ shift, setShift }}>
      {children}
    </ShiftContext.Provider>
  );
}

export function useShift() {
  return useContext(ShiftContext);
}