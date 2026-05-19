"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoyaltyAdminPage() {
  const [members, setMembers] = useState([]);
  const [profiles, setProfiles] = useState([]);

  const [loading, setLoading] = useState(true);

  // Search/filter
  const [search, setSearch] = useState("");

  // Manual linking UI
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [notice, setNotice] = useState("");

  // Optional: link requests (if you use it)
  const [linkRequests, setLinkRequests] = useState([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkActionBusy, setLinkActionBusy] = useState(null);
  const [selectedMemberByRequestId, setSelectedMemberByRequestId] = useState({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchMembers(), fetchProfiles(), fetchLinkRequests()]);
      setLoading(false);
    })();
  }, []);

  async function fetchMembers() {
    const { data, error } = await supabase.from("loyalty_members").select("*");
    if (error) {
      console.error(error);
      setMembers([]);
      return;
    }

    const sorted = (data || []).slice().sort((a, b) => {
      const ap = parseFloat(a["Points balance"] || 0) || 0;
      const bp = parseFloat(b["Points balance"] || 0) || 0;
      return bp - ap;
    });

    setMembers(sorted);
  }

  async function fetchProfiles() {
    // Pull basic fields + loyalty_account_id to show if already linked
    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,full_name,role,loyalty_account_id,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setProfiles([]);
      return;
    }
    setProfiles(data || []);
  }

  async function fetchLinkRequests() {
    setLinkLoading(true);

    const { data, error } = await supabase
      .from("loyalty_link_requests")
      .select("*")
      .eq("status", "pending");

    if (error) {
      // If table doesn’t exist or RLS blocks it, we don’t crash the page
      console.warn("link_requests not available:", error.message);
      setLinkRequests([]);
      setLinkLoading(false);
      return;
    }

    const sorted = (data || []).slice().sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da;
    });

    setLinkRequests(sorted);
    setLinkLoading(false);
  }

  // -----------------------------
  // ✅ MANUAL LINK (admin chooses profile + member)
  // Updates BOTH:
  // - loyalty_members.user_id
  // - profiles.loyalty_account_id
  // -----------------------------
  async function manualLink() {
    setNotice("");

    if (!selectedProfileId || !selectedMemberId) {
      setNotice("Please select BOTH a user profile and a loyalty member.");
      return;
    }

    setActionBusy(true);

    try {
      // 1) Ensure selected member is not already linked
      const { data: memberRow, error: memberErr } = await supabase
        .from("loyalty_members")
        .select("id,user_id,customer_name,customer_code")
        .eq("id", selectedMemberId)
        .single();

      if (memberErr) throw memberErr;

      if (memberRow?.user_id) {
        setNotice("⚠️ This loyalty member is already linked. Unlink first.");
        return;
      }

      // 2) Ensure user is not already linked to another loyalty member
      const { data: existingMemberLink, error: existingMemberErr } = await supabase
        .from("loyalty_members")
        .select("id,customer_name,customer_code")
        .eq("user_id", selectedProfileId)
        .maybeSingle();

      if (!existingMemberErr && existingMemberLink?.id) {
        setNotice(
          `⚠️ This user is already linked to (${existingMemberLink.customer_name || "Unknown"} / ${existingMemberLink.customer_code || existingMemberLink.id}). Unlink that first.`
        );
        return;
      }

      // 3) Ensure profile doesn't already have loyalty_account_id
      const { data: profileRow, error: profileErr } = await supabase
        .from("profiles")
        .select("id,loyalty_account_id,email,full_name")
        .eq("id", selectedProfileId)
        .single();

      if (profileErr) throw profileErr;

      if (profileRow?.loyalty_account_id) {
        setNotice(
          `⚠️ This profile already has loyalty_account_id = ${profileRow.loyalty_account_id}. Unlink first.`
        );
        return;
      }

      // 4) Update member.user_id
      const { error: linkErr } = await supabase
        .from("loyalty_members")
        .update({ user_id: selectedProfileId })
        .eq("id", selectedMemberId);

      if (linkErr) throw linkErr;

      // 5) Update profile.loyalty_account_id
      const { error: profLinkErr } = await supabase
        .from("profiles")
        .update({ loyalty_account_id: selectedMemberId })
        .eq("id", selectedProfileId);

      if (profLinkErr) {
        // rollback member link if profile update fails
        await supabase
          .from("loyalty_members")
          .update({ user_id: null })
          .eq("id", selectedMemberId);
        throw profLinkErr;
      }

      setNotice("✅ Manual link successful.");
      setSelectedMemberId("");
      setSelectedProfileId("");

      await Promise.all([fetchMembers(), fetchProfiles(), fetchLinkRequests()]);
    } catch (e) {
      setNotice("Manual link failed: " + (e?.message || "Unknown error"));
    } finally {
      setActionBusy(false);
    }
  }

  // -----------------------------
  // ✅ UNLINK (clears BOTH tables)
  // -----------------------------
  async function unlinkMember(member) {
    setNotice("");

    const memberId = member?.id;
    const userId = member?.user_id;

    if (!memberId) return;

    const ok = confirm(
      `Unlink this loyalty member?\n\n${member?.customer_name || "Member"} (${member?.customer_code || memberId})`
    );
    if (!ok) return;

    setActionBusy(true);

    try {
      // 1) Clear loyalty_members.user_id
      const { error: unlinkErr } = await supabase
        .from("loyalty_members")
        .update({ user_id: null })
        .eq("id", memberId);

      if (unlinkErr) throw unlinkErr;

      // 2) Clear profiles.loyalty_account_id by userId (if we have it)
      if (userId) {
        const { error: profErr } = await supabase
          .from("profiles")
          .update({ loyalty_account_id: null })
          .eq("id", userId);

        if (profErr) throw profErr;
      }

      // 3) Safety: clear any profile pointing to this loyalty member id
      await supabase
        .from("profiles")
        .update({ loyalty_account_id: null })
        .eq("loyalty_account_id", memberId);

      setNotice("✅ Unlinked successfully.");
      await Promise.all([fetchMembers(), fetchProfiles(), fetchLinkRequests()]);
    } catch (e) {
      setNotice("Unlink failed: " + (e?.message || "Unknown error"));
    } finally {
      setActionBusy(false);
    }
  }

  // -----------------------------
  // OPTIONAL: approve link requests
  // Updates BOTH tables too
  // -----------------------------
  async function approveLinkRequest(req) {
    const requestId = req.id;
    const userId = req.user_id;
    const memberId = req.member_id || selectedMemberByRequestId[requestId] || "";

    if (!userId) {
      alert("Request has no user_id.");
      return;
    }
    if (!memberId) {
      alert("Select a member to link for this request.");
      return;
    }

    setLinkActionBusy(requestId);
    setNotice("");

    try {
      // member must be unlinked
      const { data: memberRow, error: memberErr } = await supabase
        .from("loyalty_members")
        .select("id,user_id")
        .eq("id", memberId)
        .single();

      if (memberErr) throw memberErr;
      if (memberRow?.user_id) {
        alert("This member is already linked. Unlink first.");
        return;
      }

      // profile must be unlinked
      const { data: profileRow, error: profileErr } = await supabase
        .from("profiles")
        .select("id,loyalty_account_id")
        .eq("id", userId)
        .single();

      if (profileErr) throw profileErr;
      if (profileRow?.loyalty_account_id) {
        alert("This profile already has a loyalty_account_id. Unlink first.");
        return;
      }

      // link both
      const { error: linkErr } = await supabase
        .from("loyalty_members")
        .update({ user_id: userId })
        .eq("id", memberId);

      if (linkErr) throw linkErr;

      const { error: profLinkErr } = await supabase
        .from("profiles")
        .update({ loyalty_account_id: memberId })
        .eq("id", userId);

      if (profLinkErr) {
        await supabase.from("loyalty_members").update({ user_id: null }).eq("id", memberId);
        throw profLinkErr;
      }

      // mark request approved
      const { error: reqErr } = await supabase
        .from("loyalty_link_requests")
        .update({ status: "approved", matched_member_id: memberId })
        .eq("id", requestId);

      if (reqErr) throw reqErr;

      setNotice("✅ Link request approved.");
      await Promise.all([fetchMembers(), fetchProfiles(), fetchLinkRequests()]);
    } catch (e) {
      setNotice("Approve failed: " + (e?.message || "Unknown error"));
    } finally {
      setLinkActionBusy(null);
    }
  }

  async function rejectLinkRequest(requestId) {
    setLinkActionBusy(requestId);
    try {
      const { error } = await supabase
        .from("loyalty_link_requests")
        .update({ status: "rejected" })
        .eq("id", requestId);
      if (error) throw error;
      await fetchLinkRequests();
    } catch (e) {
      alert("Reject failed: " + (e?.message || "Unknown error"));
    } finally {
      setLinkActionBusy(null);
    }
  }

  const filteredMembers = useMemo(() => {
    const s = (search || "").toLowerCase();
    return members.filter((m) => {
      const n = String(m.customer_name || m["customer_name"] || "").toLowerCase();
      const c = String(m.customer_code || m["customer_code"] || "").toLowerCase();
      const p = String(m["Phone"] || "");
      return n.includes(s) || c.includes(s) || p.includes(search || "");
    });
  }, [members, search]);

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-24 px-3 md:px-8 space-y-6">
      <header className="pt-4 md:pt-6">
        <h1 className="text-2xl md:text-4xl font-normal text-slate-800 tracking-tight">
          JUJA LOYALTY PROGRAM (Admin)
        </h1>
        <p className="text-slate-400 text-xs md:text-sm mt-2">
          Members: {members.length}
        </p>

        {notice && (
          <div className="mt-4 bg-rose-50 border border-rose-100 text-slate-700 rounded-xl p-3 text-sm">
            {notice}
          </div>
        )}
      </header>

      {/* ✅ MANUAL LINK (always visible) */}
      <section className="bg-white border border-rose-100 rounded-2xl p-4 md:p-5">
        <h2 className="text-sm md:text-base font-semibold text-slate-800">
          Manual Link / Unlink
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Pick a user profile and a loyalty member, then link them.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
              Select User (profiles)
            </label>
            <select
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm"
            >
              <option value="">-- choose user --</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.full_name || p.email || p.id) +
                    (p.loyalty_account_id ? " (already linked)" : "")}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
              Select Loyalty Member
            </label>
            <select
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm"
            >
              <option value="">-- choose member --</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {(m.customer_name || m.customer_code || m.id) +
                    (m.user_id ? " (already linked)" : "")}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={manualLink}
            disabled={actionBusy}
            className="px-4 py-2 rounded-xl bg-[#FC687D] text-white text-xs font-bold disabled:opacity-60"
          >
            {actionBusy ? "Working..." : "Link Now"}
          </button>

          <button
            onClick={() => {
              setSelectedProfileId("");
              setSelectedMemberId("");
              setNotice("");
            }}
            disabled={actionBusy}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold disabled:opacity-60"
          >
            Clear
          </button>
        </div>
      </section>

      {/* ✅ OPTIONAL: Link Requests section */}
      <section className="bg-white border border-rose-100 rounded-2xl p-4 md:p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm md:text-base font-semibold text-slate-800">
            Link Requests (optional)
          </h2>
          <button
            onClick={fetchLinkRequests}
            className="px-3 py-2 bg-slate-50 border border-slate-100 text-[10px] md:text-xs text-slate-500 rounded-xl active:scale-95"
          >
            Refresh
          </button>
        </div>

        {linkLoading ? (
          <p className="text-xs text-slate-400 mt-3">Loading…</p>
        ) : linkRequests.length === 0 ? (
          <p className="text-xs text-slate-400 mt-3">No pending requests.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {linkRequests.map((req) => (
              <div key={req.id} className="border border-slate-200 rounded-xl p-3">
                <p className="text-xs text-slate-600">
                  Request: <span className="font-mono">{req.id}</span>
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  User: <span className="font-mono">{req.user_id || "N/A"}</span>
                </p>

                {!req.member_id && (
                  <select
                    value={selectedMemberByRequestId[req.id] || ""}
                    onChange={(e) =>
                      setSelectedMemberByRequestId((prev) => ({
                        ...prev,
                        [req.id]: e.target.value,
                      }))
                    }
                    className="mt-2 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="">-- choose member --</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {(m.customer_name || m.customer_code || m.id) +
                          (m.user_id ? " (already linked)" : "")}
                      </option>
                    ))}
                  </select>
                )}

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => approveLinkRequest(req)}
                    disabled={linkActionBusy === req.id}
                    className="px-3 py-2 rounded-xl bg-[#FC687D] text-white text-xs font-bold disabled:opacity-60"
                  >
                    {linkActionBusy === req.id ? "Working..." : "Approve"}
                  </button>
                  <button
                    onClick={() => rejectLinkRequest(req.id)}
                    disabled={linkActionBusy === req.id}
                    className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold disabled:opacity-60"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Search */}
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
          🔍
        </span>
        <input
          type="text"
          placeholder="Search members by name, code, phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm"
        />
      </div>

      {/* Members list */}
      <div className="space-y-3">
        {filteredMembers.map((member) => (
          <div
            key={member.id}
            className="bg-white rounded-2xl border border-rose-100 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 truncate">
                {member.customer_name || member["customer_name"] || "Unknown Member"}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Code: <span className="font-mono">{member.customer_code || member["customer_code"] || "—"}</span>
                {" • "}
                User: <span className="font-mono">{member.user_id || "—"}</span>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Points: <span className="font-mono">{member["Points balance"] ?? "0"}</span>
                {" • "}
                Visits: <span className="font-mono">{member["Total visits"] ?? 0}</span>
              </p>
            </div>

            <div className="flex gap-2">
              {member.user_id && (
                <button
                  onClick={() => unlinkMember(member)}
                  disabled={actionBusy}
                  className="px-3 py-2 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-bold disabled:opacity-60"
                >
                  Unlink
                </button>
              )}
            </div>
          </div>
        ))}

        {filteredMembers.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm bg-white/60 border border-dashed border-slate-200 rounded-2xl">
            No members found
          </div>
        )}
      </div>
    </div>
  );
}
``