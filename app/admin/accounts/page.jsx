"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDateTime } from "@/lib/dateFormat";

function accountName(account) {
  return account.full_name || account.email || "Unnamed account";
}

const ROLE_ORDER = ["super_admin", "admin", "cashier", "kds", "kitchen", "customer"];

function roleLabel(role) {
  const value = String(role || "user").trim() || "user";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function AdminAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");

  async function loadAccounts() {
    setLoading(true);
    setNotice("");
    try {
      const res = await fetch("/api/admin/accounts", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to load accounts.");
      setAccounts(json.accounts || []);
    } catch (error) {
      setNotice(error.message || "Unable to load accounts.");
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((account) =>
      [
        accountName(account),
        account.email,
        account.role,
        account.store_name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [accounts, search]);

  const groupedAccounts = useMemo(() => {
    const map = new Map();
    filteredAccounts.forEach((account) => {
      const role = String(account.role || "user").toLowerCase();
      if (!map.has(role)) map.set(role, []);
      map.get(role).push(account);
    });

    return Array.from(map.entries())
      .map(([role, rows]) => ({
        role,
        label: roleLabel(role),
        rows: rows.sort((a, b) => accountName(a).localeCompare(accountName(b))),
      }))
      .sort((a, b) => {
        const ai = ROLE_ORDER.indexOf(a.role);
        const bi = ROLE_ORDER.indexOf(b.role);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        return a.label.localeCompare(b.label);
      });
  }, [filteredAccounts]);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200/75 bg-white/84 p-6 text-slate-900 shadow-[0_24px_70px_rgba(51,65,85,0.14)] backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.28em] text-slate-600">Admin Control</p>
        <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Accounts</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              View all admin, cashier, customer, and KDS accounts with profile, email, creation date, and last sign-in details.
            </p>
          </div>
          <button
            type="button"
            onClick={loadAccounts}
            className="h-11 rounded-xl border border-slate-300 bg-white/80 px-5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:text-slate-900"
          >
            Refresh
          </button>
        </div>
      </div>

      {notice ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-900 shadow-sm">
          {notice}
        </div>
      ) : null}

      <div className="rounded-3xl border border-white/50 bg-white/82 p-5 shadow-[0_22px_55px_rgba(15,23,42,0.10)] backdrop-blur-xl">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Account Directory</p>
            <p className="mt-1 text-sm text-slate-600">{filteredAccounts.length} account(s)</p>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, role, store..."
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20 md:max-w-sm"
          />
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">
            Loading accounts...
          </div>
        ) : groupedAccounts.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">
            No accounts found.
          </div>
        ) : (
          <div className="space-y-5">
            {groupedAccounts.map((group) => (
              <section key={group.role} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-800">{group.label}</h2>
                    <p className="mt-1 text-xs text-slate-500">{group.rows.length} account(s)</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead className="bg-slate-100 text-left text-[10px] uppercase tracking-[0.16em] text-slate-700">
                      <tr>
                        <th className="p-3">Full Name</th>
                        <th>Email Address</th>
                        <th>Store</th>
                        <th>Date Created</th>
                        <th>Last Sign In</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((account) => (
                        <tr key={account.id} className="border-t border-slate-100 transition hover:bg-cyan-50/45">
                          <td className="p-3 font-semibold text-slate-950">{accountName(account)}</td>
                          <td className="text-slate-700">{account.email || "-"}</td>
                          <td className="text-slate-700">{account.store_name || "All stores"}</td>
                          <td className="text-slate-700">{formatDateTime(account.created_at)}</td>
                          <td className="text-slate-700">{formatDateTime(account.last_sign_in_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
