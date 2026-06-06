"use client";

import { useEffect } from "react";

function financePath(path) {
  if (typeof window === "undefined") return `/finance${path}`;
  return window.location.hostname.startsWith("finance.") ? path : `/finance${path}`;
}

export default function FinanceHomePage() {
  useEffect(() => {
    window.location.replace(financePath("/expenses"));
  }, []);

  return (
    <div className="py-16 text-center text-sm font-bold text-slate-500">
      Opening finance...
    </div>
  );
}
