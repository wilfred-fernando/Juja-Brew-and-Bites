"use client";

import { useEffect } from "react";

function financePayrollUrl() {
  if (typeof window === "undefined") return "/finance/payroll";
  const { protocol, hostname, port } = window.location;
  const suffix = port ? `:${port}` : "";

  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost")) {
    return `${protocol}//finance.localhost${suffix}/payroll`;
  }

  return "https://finance.jujabrewandbites.com/payroll";
}

export default function AdminPayrollMovedPage() {
  useEffect(() => {
    window.location.replace(financePayrollUrl());
  }, []);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Payroll moved to Finance</h1>
        <p className="mt-3 text-sm font-semibold text-slate-500">
          Payroll is now managed from the finance portal.
        </p>
        <button
          type="button"
          onClick={() => {
            window.location.href = financePayrollUrl();
          }}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-slate-600 px-5 text-sm font-black uppercase tracking-wide text-white"
        >
          Open Payroll
        </button>
      </div>
    </div>
  );
}
