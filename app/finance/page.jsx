"use client";

import { useEffect } from "react";

function financePath(path) {
  if (typeof window === "undefined") return `/finance${path}`;
  return window.location.hostname.startsWith("finance.") ? path : `/finance${path}`;
}

export default function FinanceHomePage() {
  useEffect(() => {
    window.location.replace(financePath("/payroll"));
  }, []);

  return (
    <div className="py-16 text-center text-sm font-bold text-slate-400">
      Opening payroll...
    </div>
  );
}
