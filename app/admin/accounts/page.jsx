"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ADMIN_ACCESS_PAGES } from "@/lib/adminPageAccess";

const supabase = getSupabaseClient();

function Toggle({ checked, disabled, onChange }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full border transition duration-200 ${
        checked
          ? "border-cyan-300/70 bg-cyan-500 shadow-[0_0_18px_rgba(6,182,212,0.22)]"
          : "border-slate-300 bg-slate-200"
      } ${disabled ? "cursor-not-allowed opacity-50" : "hover:-translate-y-0.5"}`}
      aria-pressed={checked}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
          checked ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

export default function AdminAccountsPage() {
  const [profiles, setProfiles] = useState([]);
  const [stores, setStores] = useState([]);
  const [accessRows, setAccessRows] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const storeNameById = useMemo(() => {
    const map = {};
    stores.forEach((store) => {
      map[store.id] = store.name;
    });
    return map;
  }, [stores]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);

  const selectedAccessRows = useMemo(
    () => accessRows.filter((row) => row.profile_id === selectedProfileId),
    [accessRows, selectedProfileId]
  );

  const pagesByGroup = useMemo(() => {
    return ADMIN_ACCESS_PAGES.reduce((groups, page) => {
      groups[page.group] = groups[page.group] || [];
      groups[page.group].push(page);
      return groups;
    }, {});
  }, []);

  function pageEnabled(pageKey) {
    if (selectedProfile?.role === "super_admin") return true;
    const row = selectedAccessRows.find((entry) => entry.page_key === pageKey);
    return row ? row.can_access !== false : true;
  }

  async function loadData() {
    setLoading(true);
    setNotice("");

    const [profileRes, storeRes, accessRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, role, store_id, created_at")
        .in("role", ["admin", "super_admin", "cashier", "cashier_disabled"])
        .order("role")
        .order("full_name"),
      supabase.from("stores").select("id, name, is_active").order("name"),
      supabase.from("profile_page_access").select("profile_id, page_key, can_access"),
    ]);

    if (profileRes.error) setNotice(profileRes.error.message);
    if (accessRes.error) {
      setNotice("Run the new Supabase SQL setup first so page access toggles can be saved.");
      setAccessRows([]);
    } else {
      setAccessRows(accessRes.data || []);
    }

    const nextProfiles = profileRes.data || [];
    setProfiles(nextProfiles);
    setStores(storeRes.data || []);
    setSelectedProfileId((current) => current || nextProfiles[0]?.id || "");
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function setPageAccess(pageKey, enabled) {
    if (!selectedProfileId || selectedProfile?.role === "super_admin") return;
    setBusyKey(`${selectedProfileId}:${pageKey}`);
    setNotice("");

    const payload = {
      profile_id: selectedProfileId,
      page_key: pageKey,
      can_access: enabled,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("profile_page_access")
      .upsert(payload, { onConflict: "profile_id,page_key" });

    setBusyKey("");

    if (error) {
      setNotice(error.message);
      return;
    }

    setAccessRows((prev) => {
      const without = prev.filter((row) => !(row.profile_id === selectedProfileId && row.page_key === pageKey));
      return [...without, payload];
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-100 border-t-cyan-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/35 bg-slate-900/88 p-6 text-white shadow-[0_24px_70px_rgba(15,23,42,0.20)] backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.28em] text-cyan-200">Admin Control</p>
        <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Accounts</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-200">
              Manage page visibility for admin and cashier accounts. Super admin accounts always keep full access.
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="h-11 rounded-xl border border-cyan-200/40 bg-cyan-300/10 px-5 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:-translate-y-0.5 hover:bg-cyan-300/18"
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

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="rounded-3xl border border-white/50 bg-white/82 p-4 shadow-[0_22px_55px_rgba(15,23,42,0.10)] backdrop-blur-xl">
          <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Accounts</p>
          <div className="space-y-2">
            {profiles.map((profile) => (
              <button
                type="button"
                key={profile.id}
                onClick={() => setSelectedProfileId(profile.id)}
                className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${
                  selectedProfileId === profile.id
                    ? "border-cyan-300 bg-cyan-50/90 shadow-[0_0_26px_rgba(34,211,238,0.12)]"
                    : "border-slate-200 bg-white/80 hover:border-cyan-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{profile.full_name || "Unnamed account"}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">{profile.role}</p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] uppercase text-slate-600">
                    {storeNameById[profile.store_id] || "All"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/50 bg-white/82 p-5 shadow-[0_22px_55px_rgba(15,23,42,0.10)] backdrop-blur-xl">
          {selectedProfile ? (
            <div className="space-y-6">
              <div className="border-b border-slate-200/70 pb-4">
                <p className="text-xs uppercase tracking-[0.22em] text-cyan-700">Selected Account</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-950">{selectedProfile.full_name || "Unnamed account"}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {selectedProfile.role} / {storeNameById[selectedProfile.store_id] || "All stores"}
                </p>
              </div>

              {Object.entries(pagesByGroup).map(([group, pages]) => (
                <section key={group} className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{group}</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {pages.map((page) => {
                      const enabled = pageEnabled(page.key);
                      return (
                        <div key={page.key} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/86 p-4">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">{page.label}</p>
                            <p className="mt-1 text-xs text-slate-500">{page.path}</p>
                          </div>
                          <Toggle
                            checked={enabled}
                            disabled={selectedProfile.role === "super_admin" || busyKey === `${selectedProfileId}:${page.key}`}
                            onChange={(next) => setPageAccess(page.key, next)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-slate-500">No account selected.</div>
          )}
        </div>
      </div>
    </div>
  );
}
