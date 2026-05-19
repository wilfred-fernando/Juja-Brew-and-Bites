"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoyaltyAdminPage() {
  // =========================
  // DATA
  // =========================
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // =========================
  // LIST SEARCH
  // =========================
  const [search, setSearch] = useState("");

  // =========================
  // EDIT MODAL
  // =========================
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [form, setForm] = useState({
    customer_name: "",
    Phone: "",
    "Points balance": 0,
    "Total visits": 0,
    Note: "",
  });
  const [saving, setSaving] = useState(false);

  // =========================
  // LINK REQUESTS (PENDING APPROVAL)
  // =========================
  const [linkRequests, setLinkRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestBusyId, setRequestBusyId] = useState(null);

  // map user_id -> {full_name,email}
  const [profilesById, setProfilesById] = useState({});

  // per-request: selected member id (for manual choose)
  const [selectedMemberByRequestId, setSelectedMemberByRequestId] = useState({});
  // per-request: search input
  const [requestMemberQueryById, setRequestMemberQueryById] = useState({});

  // =========================
  // MANUAL LINK UI
  // =========================
  const [notice, setNotice] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  // Select user by email (searchable)
  const [userQuery, setUserQuery] = useState("");
  const [userOptions, setUserOptions] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const userTimer = useRef(null);

  // Select loyalty member by typing (searchable)
  const [memberQuery, setMemberQuery] = useState("");
  const [memberOptions, setMemberOptions] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const memberTimer = useRef(null);

  // =========================
  // CONFIRM MODAL
  // =========================
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    type: null, // "unlink" | "delete"
    payload: null,
    title: "",
    message: "",
    confirmText: "Confirm",
    tone: "danger", // "danger" | "primary"
  });

  function openConfirm({ type, payload, title, message, confirmText, tone }) {
    setConfirmModal({
      open: true,
      type,
      payload,
      title,
      message,
      confirmText: confirmText || "Confirm",
      tone: tone || "danger",
    });
  }

  function closeConfirm() {
    setConfirmModal({
      open: false,
      type: null,
      payload: null,
      title: "",
      message: "",
      confirmText: "Confirm",
      tone: "danger",
    });
  }

  // =========================
  // INITIAL LOAD
  // =========================
  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchMembers(), fetchLinkRequests()]);
      setLoading(false);
    })();
  }, []);

  // =========================
  // FETCH MEMBERS
  // =========================
  async function fetchMembers() {
    const { data, error } = await supabase.from("loyalty_members").select("*");
    if (error) {
      console.error(error);
      setMembers([]);
      setNotice(`❌ ${error.message}`);
      return;
    }

    const sorted = (data || []).slice().sort((a, b) => {
      const ap = parseFloat(a["Points balance"] || 0) || 0;
      const bp = parseFloat(b["Points balance"] || 0) || 0;
      return bp - ap;
    });

    setMembers(sorted);
  }

  // =========================
  // FETCH LINK REQUESTS + FETCH PROFILES for display
  // =========================
  async function fetchLinkRequests() {
    setLoadingRequests(true);

    const { data, error } = await supabase
      .from("loyalty_link_requests")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setLinkRequests([]);
      setLoadingRequests(false);
      return;
    }

    const reqs = data || [];
    setLinkRequests(reqs);

    // Fetch profiles for user display (full_name/email)
    const userIds = Array.from(new Set(reqs.map((r) => r.user_id).filter(Boolean)));
    if (userIds.length > 0) {
      const { data: pData, error: pErr } = await supabase
        .from("profiles")
        .select("id,email,full_name")
        .in("id", userIds);

      if (!pErr) {
        const map = {};
        (pData || []).forEach((p) => {
          map[p.id] = { full_name: p.full_name || "", email: p.email || "" };
        });
        setProfilesById(map);
      }
    }

    setLoadingRequests(false);
  }

  // =========================
  // HELPERS
  // =========================
  const memberById = useMemo(() => {
    const map = {};
    for (const m of members) map[m.id] = m;
    return map;
  }, [members]);

  const unlinkedMembers = useMemo(() => members.filter((m) => !m.user_id), [members]);

  function userLabel(userId) {
    const p = profilesById[userId];
    if (!userId) return "—";
    if (p?.full_name) return p.full_name;
    if (p?.email) return p.email;
    return userId;
  }

  function userSubLabel(userId) {
    const p = profilesById[userId];
    if (!userId) return "";
    if (p?.email && p?.full_name) return p.email;
    if (p?.email) return p.email;
    return userId;
  }

  function requestCandidateList(reqId) {
    const q = (requestMemberQueryById[reqId] || "").trim().toLowerCase();
    const base = unlinkedMembers;

    if (!q) return base.slice(0, 8);

    return base
      .filter((m) => {
        const name = String(m.customer_name || m["customer_name"] || "").toLowerCase();
        const code = String(m.customer_code || m["customer_code"] || "").toLowerCase();
        const phone = String(m["Phone"] || "").toLowerCase();
        const city = String(m["City"] || "").toLowerCase();
        return (
          name.includes(q) ||
          code.includes(q) ||
          phone.includes(q) ||
          city.includes(q)
        );
      })
      .slice(0, 8);
  }

  // =========================
  // APPROVE REQUEST (links BOTH tables)
  // =========================
  async function approveRequest(req) {
  const requestId = req.id;
  const userId = req.user_id;

  // ✅ Define it here (this fixes your error)
  const chosenMemberId =
    req.matched_member_id || selectedMemberByRequestId[requestId] || null;

  if (!userId) {
    setNotice("❌ Request has no user_id.");
    return;
  }

  if (!chosenMemberId) {
    setNotice("⚠️ Select a loyalty member to approve this request.");
    return;
  }

  setRequestBusyId(requestId);
  setNotice("");

  try {
    // 1) Ensure member exists and not linked
    const { data: memberRow, error: memberErr } = await supabase
      .from("loyalty_members")
      .select("id,user_id,customer_name,customer_code")
      .eq("id", chosenMemberId)
      .single();

    if (memberErr) throw memberErr;

    if (memberRow?.user_id) {
      setNotice("⚠️ This loyalty member is already linked. Unlink first.");
      return;
    }

    // 2) Ensure profile is not already linked
    const { data: profileRow, error: profileErr } = await supabase
      .from("profiles")
      .select("id,loyalty_account_id")
      .eq("id", userId)
      .single();

    if (profileErr) throw profileErr;

    if (profileRow?.loyalty_account_id) {
      setNotice(
        `⚠️ This user already has loyalty_account_id = ${profileRow.loyalty_account_id}. Unlink first.`
      );
      return;
    }

    // 3) Link member -> user
    const { error: linkErr } = await supabase
      .from("loyalty_members")
      .update({ user_id: userId })
      .eq("id", chosenMemberId);

    if (linkErr) throw linkErr;

    // 4) Link profile -> member
    const { error: profLinkErr } = await supabase
      .from("profiles")
      .update({ loyalty_account_id: chosenMemberId })
      .eq("id", userId);

    if (profLinkErr) {
      // rollback member link if profile update fails
      await supabase
        .from("loyalty_members")
        .update({ user_id: null })
        .eq("id", chosenMemberId);
      throw profLinkErr;
    }

    // 5) Mark request approved + timestamp
    const { error: reqErr } = await supabase
      .from("loyalty_link_requests")
      .update({
        status: "approved",
        matched_member_id: chosenMemberId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (reqErr) throw reqErr;

    // ✅ remove row from UI immediately (even if refetch is slow)
    setLinkRequests((prev) => prev.filter((r) => r.id !== requestId));

    setNotice("✅ Approved and linked successfully.");
    await Promise.all([fetchMembers(), fetchLinkRequests()]);
  } catch (err) {
    setNotice("❌ Approve failed: " + (err?.message || "Unknown error"));
  } finally {
    setRequestBusyId(null);
  }
}

  // =========================
  // REJECT REQUEST
  // =========================
  async function rejectRequest(req) {
  setRequestBusyId(req.id);

  try {
    await supabase
      .from("loyalty_link_requests")
      .update({
        status: "rejected",
        rejected_at: new Date().toISOString(),
      })
      .eq("id", req.id);

    // ✅ REMOVE FROM UI IMMEDIATELY
    setLinkRequests(prev => prev.filter(r => r.id !== req.id));

    setNotice("✅ Rejected + removed from list");

  } catch (err) {
    setNotice("❌ " + err.message);
  } finally {
    setRequestBusyId(null);
  }
}

  // =========================
  // SEARCH: Profiles by email/full_name (manual link)
  // =========================
  useEffect(() => {
    if (userTimer.current) clearTimeout(userTimer.current);

    userTimer.current = setTimeout(async () => {
      const q = userQuery.trim();
      if (q.length < 2) {
        setUserOptions([]);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,full_name,role,loyalty_account_id")
        .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
        .limit(10);

      if (error) {
        console.error(error);
        setUserOptions([]);
        return;
      }

      setUserOptions(data || []);
    }, 250);

    return () => clearTimeout(userTimer.current);
  }, [userQuery]);

  // =========================
  // SEARCH: loyalty_members by name/code (manual link)
  // =========================
  useEffect(() => {
    if (memberTimer.current) clearTimeout(memberTimer.current);

    memberTimer.current = setTimeout(async () => {
      const q = memberQuery.trim();
      if (q.length < 2) {
        setMemberOptions([]);
        return;
      }

      const { data, error } = await supabase
        .from("loyalty_members")
        .select("id,user_id,customer_name,customer_code,Email,Phone")
        .or(`customer_name.ilike.%${q}%,customer_code.ilike.%${q}%`)
        .limit(10);

      if (error) {
        console.error(error);
        setMemberOptions([]);
        return;
      }

      setMemberOptions(data || []);
    }, 250);

    return () => clearTimeout(memberTimer.current);
  }, [memberQuery]);

  // =========================
  // FILTER + SPLIT LINKED/UNLINKED (members list)
  // =========================
  const filteredMembers = useMemo(() => {
    const s = (search || "").toLowerCase();
    return members.filter((m) => {
      const name = String(m.customer_name || m["customer_name"] || "").toLowerCase();
      const code = String(m.customer_code || m["customer_code"] || "").toLowerCase();
      const phone = String(m["Phone"] || "");
      const uid = String(m.user_id || "");
      return (
        name.includes(s) ||
        code.includes(s) ||
        phone.includes(search || "") ||
        uid.toLowerCase().includes(s)
      );
    });
  }, [members, search]);

  const linkedMembersList = useMemo(
    () => filteredMembers.filter((m) => !!m.user_id),
    [filteredMembers]
  );

  const unlinkedMembersList = useMemo(
    () => filteredMembers.filter((m) => !m.user_id),
    [filteredMembers]
  );

  // =========================
  // EDIT MEMBER MODAL
  // =========================
  const openModal = (member) => {
    setEditingMember(member);
    setForm({
      customer_name: member.customer_name || member["customer_name"] || "",
      Phone: member["Phone"] || "",
      "Points balance": member["Points balance"] || 0,
      "Total visits": member["Total visits"] || 0,
      Note: member["Note"] || "",
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!editingMember?.id) return;

    setSaving(true);
    setNotice("");

    try {
      const { error } = await supabase
        .from("loyalty_members")
        .update(form)
        .eq("id", editingMember.id);

      if (error) throw error;

      await fetchMembers();
      setIsModalOpen(false);
      setNotice("✅ Changes saved.");
    } catch (err) {
      setNotice("❌ Error saving member: " + (err?.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  // =========================
  // DELETE (confirmed)
  // =========================
  async function deleteMemberConfirmed(member) {
    if (!member?.id) return;

    setActionBusy(true);
    setNotice("");

    try {
      if (member.user_id) {
        await unlinkMemberConfirmed(member, { silent: true });
      }

      const { error } = await supabase
        .from("loyalty_members")
        .delete()
        .eq("id", member.id);

      if (error) throw error;

      await fetchMembers();
      setNotice("✅ Member deleted.");
    } catch (err) {
      setNotice("❌ Delete failed: " + (err?.message || "Unknown error"));
    } finally {
      setActionBusy(false);
    }
  }

  // =========================
  // MANUAL LINK (links BOTH tables)
  // =========================
  async function manualLink() {
    setNotice("");

    if (!selectedUser?.id || !selectedMember?.id) {
      setNotice("Please select BOTH a user (email) and a loyalty member.");
      return;
    }

    setActionBusy(true);

    try {
      const { data: mRow, error: mErr } = await supabase
        .from("loyalty_members")
        .select("id,user_id,customer_name,customer_code")
        .eq("id", selectedMember.id)
        .single();

      if (mErr) throw mErr;
      if (mRow?.user_id) {
        setNotice("⚠️ Selected loyalty member is already linked. Unlink first.");
        return;
      }

      const { data: existingMember, error: exErr } = await supabase
        .from("loyalty_members")
        .select("id,customer_name,customer_code")
        .eq("user_id", selectedUser.id)
        .maybeSingle();

      if (!exErr && existingMember?.id) {
        setNotice(
          `⚠️ This user is already linked to ${existingMember.customer_name || "Unknown"} (${existingMember.customer_code || existingMember.id}). Unlink first.`
        );
        return;
      }

      const { data: pRow, error: pErr } = await supabase
        .from("profiles")
        .select("id,loyalty_account_id")
        .eq("id", selectedUser.id)
        .single();

      if (pErr) throw pErr;
      if (pRow?.loyalty_account_id) {
        setNotice(`⚠️ This user already has loyalty_account_id = ${pRow.loyalty_account_id}. Unlink first.`);
        return;
      }

      const { error: linkErr } = await supabase
        .from("loyalty_members")
        .update({ user_id: selectedUser.id })
        .eq("id", selectedMember.id);

      if (linkErr) throw linkErr;

      const { error: profErr } = await supabase
        .from("profiles")
        .update({ loyalty_account_id: selectedMember.id })
        .eq("id", selectedUser.id);

      if (profErr) {
        await supabase
          .from("loyalty_members")
          .update({ user_id: null })
          .eq("id", selectedMember.id);
        throw profErr;
      }

      setNotice("✅ Linked successfully.");
      setSelectedUser(null);
      setSelectedMember(null);
      setUserQuery("");
      setMemberQuery("");
      setUserOptions([]);
      setMemberOptions([]);

      await fetchMembers();
    } catch (err) {
      setNotice("❌ Manual link failed: " + (err?.message || "Unknown error"));
    } finally {
      setActionBusy(false);
    }
  }

  // =========================
  // UNLINK (clears BOTH tables)
  // =========================
  async function unlinkMemberConfirmed(member, { silent = false } = {}) {
    if (!member?.id) return;

    const memberId = member.id;
    const userId = member.user_id;

    const { error: uErr } = await supabase
      .from("loyalty_members")
      .update({ user_id: null })
      .eq("id", memberId);

    if (uErr) throw uErr;

    if (userId) {
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ loyalty_account_id: null })
        .eq("id", userId);

      if (pErr) throw pErr;
    }

    await supabase
      .from("profiles")
      .update({ loyalty_account_id: null })
      .eq("loyalty_account_id", memberId);

    if (!silent) {
      setNotice("✅ Unlinked successfully.");
      await fetchMembers();
    }
  }

  // =========================
  // CONFIRM MODAL ACTION
  // =========================
  async function handleConfirmAction() {
    const { type, payload } = confirmModal;
    if (!payload) return;

    try {
      setActionBusy(true);
      setNotice("");

      if (type === "unlink") {
        await unlinkMemberConfirmed(payload);
        setNotice("✅ Unlinked successfully.");
      }

      if (type === "delete") {
        await deleteMemberConfirmed(payload);
      }

      await fetchMembers();
    } catch (err) {
      setNotice("❌ Action failed: " + (err?.message || "Unknown error"));
    } finally {
      setActionBusy(false);
      closeConfirm();
    }
  }

  // =========================
  // UI: Member Card
  // =========================
  const MemberCard = ({ member }) => {
    const points = Number(member["Points balance"] || 0);
    const visits = Number(member["Total visits"] || 0);

    return (
      <div className="bg-white rounded-xl md:rounded-[20px] border border-rose-50 shadow-sm p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-800 truncate">
              {member.customer_name || member["customer_name"] || "Unknown Member"}
            </p>

            {member.user_id ? (
              <span className="bg-green-50 text-green-700 text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-md border border-green-100">
                Linked
              </span>
            ) : (
              <span className="bg-slate-50 text-slate-500 text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-md border border-slate-100">
                Not linked
              </span>
            )}
          </div>

          <p className="mt-1 text-xs text-slate-500">
            Code: <span className="font-mono">{member.customer_code || member["customer_code"] || "—"}</span>
            {" • "}
            Phone: <span className="font-mono">{member["Phone"] || "—"}</span>
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Points: <span className="font-mono">{points}</span>
            {" • "}
            Visits: <span className="font-mono">{visits}</span>
          </p>

          {member.user_id && (
            <p className="mt-1 text-xs text-slate-500">
              user_id: <span className="font-mono">{member.user_id}</span>
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => openModal(member)}
            className="px-3 py-2 bg-slate-50 border border-slate-100 text-xs text-slate-600 rounded-xl hover:bg-rose-50 hover:text-[#FC687D] active:scale-95"
          >
            Edit
          </button>

          {member.user_id && (
            <button
              onClick={() =>
                openConfirm({
                  type: "unlink",
                  payload: member,
                  title: "Unlink member?",
                  message: `This will disconnect the user account from "${member.customer_name || "Member"}" (${member.customer_code || member.id}).`,
                  confirmText: "Unlink",
                  tone: "danger",
                })
              }
              disabled={actionBusy}
              className="px-3 py-2 bg-red-50 border border-red-100 text-xs text-red-600 rounded-xl hover:bg-red-100 active:scale-95 disabled:opacity-60"
            >
              Unlink
            </button>
          )}

          <button
            onClick={() =>
              openConfirm({
                type: "delete",
                payload: member,
                title: "Delete loyalty member?",
                message: `This is permanent. "${member.customer_name || "Member"}" (${member.customer_code || member.id}) will be removed.`,
                confirmText: "Delete",
                tone: "danger",
              })
            }
            disabled={actionBusy}
            className="px-3 py-2 bg-white border border-slate-200 text-xs text-slate-600 rounded-xl hover:bg-slate-50 active:scale-95 disabled:opacity-60"
          >
            Delete
          </button>
        </div>
      </div>
    );
  };

  // =========================
  // RENDER
  // =========================
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
          JUJA LOYALTY PROGRAM
        </h1>
        <p className="text-slate-400 text-xs md:text-sm mt-2">
          ADMIN DASHBOARD (Members: {members.length} • Linked: {linkedMembersList.length} • Not linked: {unlinkedMembersList.length})
        </p>

        {notice && (
          <div className="mt-4 bg-rose-50 border border-rose-100 text-slate-700 rounded-xl p-3 text-sm">
            {notice}
          </div>
        )}
      </header>

      {/* ✅ LINK REQUESTS (PENDING) */}
      <section className="bg-white border border-rose-100 rounded-2xl p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm md:text-base font-semibold text-slate-800">
            Link Requests (Pending)
          </h2>

          <button
            onClick={fetchLinkRequests}
            className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600 hover:bg-rose-50 hover:text-[#FC687D] active:scale-95"
          >
            Refresh
          </button>
        </div>

        {loadingRequests ? (
          <p className="text-sm text-slate-500 mt-3">Loading requests…</p>
        ) : linkRequests.length === 0 ? (
          <p className="text-sm text-slate-400 mt-3">No pending requests.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {linkRequests.map((req) => {
              const isBusy = requestBusyId === req.id;
              const matched = req.matched_member_id ? memberById[req.matched_member_id] : null;

              return (
                <div key={req.id} className="border border-slate-200 rounded-2xl p-4 bg-white">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-800">
                          {userLabel(req.user_id)}
                        </p>
                        <span className="text-slate-300">•</span>
                        <p className="text-xs text-slate-500">
                          {userSubLabel(req.user_id)}
                        </p>
                      </div>

                      <div className="mt-2 text-xs text-slate-500 space-y-1">
                        <div>
                          Input Name: <span className="font-mono">{req.input_name || "—"}</span>
                        </div>
                        <div>
                          Input Birthday: <span className="font-mono">{req.input_birthday || "—"}</span>
                        </div>
                        <div>
                          Request ID: <span className="font-mono">{req.id}</span>
                        </div>
                      </div>

                      {/* ✅ SHOW MATCHED MEMBER DETAILS FOR VERIFICATION */}
                      {req.matched_member_id && (
                        <div className="mt-3 bg-[#FFF9FA] border border-rose-100 rounded-xl p-3">
                          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                            Matched Member (Verify)
                          </p>
                          {matched ? (
                            <div className="mt-2 text-sm text-slate-700 space-y-1">
                              <div className="font-semibold text-slate-800">
                                {matched.customer_name || matched["customer_name"] || "Unknown"} •{" "}
                                <span className="font-mono">{matched.customer_code || matched["customer_code"] || matched.id}</span>
                              </div>
                              <div className="text-xs text-slate-600">
                                Phone: <span className="font-mono">{matched["Phone"] || "—"}</span>{" "}
                                • City: <span className="font-mono">{matched["City"] || "—"}</span>
                              </div>
                              <div className="text-xs text-slate-600">
                                Birthday: <span className="font-mono">{matched["Note"] || "—"}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-slate-500">
                              matched_member_id: <span className="font-mono">{req.matched_member_id}</span>
                              <div className="text-[11px] text-slate-400 mt-1">
                                (Member details not found in loaded list — refresh members.)
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ✅ TYPE-TO-SEARCH MEMBER WHEN NO MATCH */}
                      {!req.matched_member_id && (
                        <div className="mt-3">
                          <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                            Search Member to Link (type name/code/phone/city)
                          </label>

                          <input
                            value={requestMemberQueryById[req.id] || ""}
                            onChange={(e) =>
                              setRequestMemberQueryById((prev) => ({
                                ...prev,
                                [req.id]: e.target.value,
                              }))
                            }
                            placeholder="e.g. Maria / JUJA2026 / 09xx / QC"
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm"
                          />

                          {(requestMemberQueryById[req.id] || "").trim().length > 0 && (
                            <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden bg-white">
                              {requestCandidateList(req.id).length === 0 ? (
                                <div className="px-3 py-2 text-xs text-slate-500">
                                  No matches among unlinked members.
                                </div>
                              ) : (
                                requestCandidateList(req.id).map((m) => (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() =>
                                      setSelectedMemberByRequestId((prev) => ({
                                        ...prev,
                                        [req.id]: m.id,
                                      }))
                                    }
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-rose-50 ${
                                      selectedMemberByRequestId[req.id] === m.id
                                        ? "bg-rose-50"
                                        : ""
                                    }`}
                                  >
                                    <div className="font-semibold text-slate-800">
                                      {m.customer_name || m["customer_name"] || "Unknown"} •{" "}
                                      <span className="font-mono">
                                        {m.customer_code || m["customer_code"] || m.id}
                                      </span>
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      Phone: {m["Phone"] || "—"} • City: {m["City"] || "—"} • Birthday: {m["Note"] || "—"}
                                    </div>
                                  </button>
                                ))
                              )}
                            </div>
                          )}

                          {selectedMemberByRequestId[req.id] && (
                            <div className="mt-2 text-xs text-slate-600">
                              Selected member id:{" "}
                              <span className="font-mono">{selectedMemberByRequestId[req.id]}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => approveRequest(req)}
                        disabled={isBusy}
                        className="px-3 py-2 rounded-xl bg-[#FC687D] text-white text-xs font-bold disabled:opacity-60"
                      >
                        {isBusy ? "Working…" : "Approve"}
                      </button>

                      <button
                        onClick={() => rejectRequest(req)}
                        disabled={isBusy}
                        className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ✅ MANUAL LINK */}
      <section className="bg-white border border-rose-100 rounded-2xl p-4 md:p-5">
        <h2 className="text-sm md:text-base font-semibold text-slate-800">Manual Link</h2>
        <p className="text-xs text-slate-500 mt-1">
          Select a user by email (type to search), then select a loyalty member (type to search), then link.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
              Select User (type email)
            </label>
            <input
              value={userQuery}
              onChange={(e) => {
                setUserQuery(e.target.value);
                setSelectedUser(null);
              }}
              placeholder="Type email or name…"
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm"
            />

            {userOptions.length > 0 && !selectedUser && (
              <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden bg-white">
                {userOptions.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedUser(u);
                      setUserQuery(u.email || u.full_name || u.id);
                      setUserOptions([]);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-rose-50"
                  >
                    <div className="font-semibold text-slate-800">{u.email || "(no email)"}</div>
                    <div className="text-xs text-slate-500">
                      {u.full_name || u.id}
                      {u.loyalty_account_id ? " • (already linked)" : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedUser && (
              <div className="mt-2 text-xs text-slate-600">
                Selected user: <span className="font-mono">{selectedUser.id}</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
              Select Loyalty Member (type name/code)
            </label>
            <input
              value={memberQuery}
              onChange={(e) => {
                setMemberQuery(e.target.value);
                setSelectedMember(null);
              }}
              placeholder="Type customer name or code…"
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm"
            />

            {memberOptions.length > 0 && !selectedMember && (
              <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden bg-white">
                {memberOptions.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSelectedMember(m);
                      setMemberQuery(m.customer_name || m.customer_code || m.id);
                      setMemberOptions([]);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-rose-50"
                  >
                    <div className="font-semibold text-slate-800">
                      {m.customer_name || "Unknown"} • {m.customer_code || m.id}
                    </div>
                    <div className="text-xs text-slate-500">
                      {m.user_id ? "(already linked)" : "Not linked"}
                      {m.Email ? ` • ${m.Email}` : ""}
                      {m.Phone ? ` • ${m.Phone}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedMember && (
              <div className="mt-2 text-xs text-slate-600">
                Selected member: <span className="font-mono">{selectedMember.id}</span>
              </div>
            )}
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
              setSelectedUser(null);
              setSelectedMember(null);
              setUserQuery("");
              setMemberQuery("");
              setUserOptions([]);
              setMemberOptions([]);
              setNotice("");
            }}
            disabled={actionBusy}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold disabled:opacity-60"
          >
            Clear
          </button>
        </div>
      </section>

      {/* SEARCH */}
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
          🔍
        </span>
        <input
          type="text"
          placeholder="Search members by name, code, phone, user_id..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm"
        />
      </div>

      {/* LINKED */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700">Linked Accounts</h2>
          <span className="text-xs text-slate-400">{linkedMembersList.length}</span>
        </div>

        {linkedMembersList.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm bg-white/60 border border-dashed border-slate-200 rounded-2xl">
            No linked members found
          </div>
        ) : (
          linkedMembersList.map((m) => <MemberCard key={m.id} member={m} />)
        )}
      </section>

      {/* NOT LINKED */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700">Not Linked</h2>
          <span className="text-xs text-slate-400">{unlinkedMembersList.length}</span>
        </div>

        {unlinkedMembersList.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm bg-white/60 border border-dashed border-slate-200 rounded-2xl">
            No unlinked members found
          </div>
        ) : (
          unlinkedMembersList.map((m) => <MemberCard key={m.id} member={m} />)
        )}
      </section>

      {/* CONFIRM MODAL */}
      {confirmModal.open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={closeConfirm}
        >
          <div
            className="bg-white w-full max-w-md rounded-t-[24px] md:rounded-[28px] p-5 md:p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">
                  Confirmation
                </p>
                <h3 className="text-lg md:text-xl font-semibold text-slate-800 mt-1">
                  {confirmModal.title || "Confirm action"}
                </h3>
              </div>
              <button
                onClick={closeConfirm}
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-slate-600 mt-3">
              {confirmModal.message || "Are you sure you want to continue?"}
            </p>

            <div className="grid grid-cols-2 gap-2 mt-5 pt-4 border-t border-slate-100">
              <button
                onClick={closeConfirm}
                className="w-full py-3 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold active:scale-95"
              >
                Cancel
              </button>

              <button
                onClick={handleConfirmAction}
                disabled={actionBusy}
                className={`w-full py-3 rounded-xl text-white text-xs font-bold active:scale-95 disabled:opacity-60 ${
                  confirmModal.tone === "primary"
                    ? "bg-[#FC687D] hover:bg-rose-500"
                    : "bg-red-500 hover:bg-red-600"
                }`}
              >
                {actionBusy ? "Working..." : confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {isModalOpen && editingMember && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-white w-full max-w-md rounded-t-[24px] md:rounded-[28px] p-5 md:p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="text-xl md:text-2xl font-semibold text-slate-800">
                  Edit Member
                </h3>
                <p className="font-mono text-[10px] text-slate-400 mt-1">
                  {editingMember.customer_code || editingMember["customer_code"] || editingMember.id}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-800 hover:bg-slate-100 active:scale-90"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:outline-none focus:border-[#FC687D]"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                  Phone
                </label>
                <input
                  type="text"
                  value={form.Phone}
                  onChange={(e) => setForm({ ...form, Phone: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:outline-none focus:border-[#FC687D]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                    Points
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form["Points balance"]}
                    onChange={(e) => setForm({ ...form, "Points balance": e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                    Visits
                  </label>
                  <input
                    type="number"
                    value={form["Total visits"]}
                    onChange={(e) => setForm({ ...form, "Total visits": e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                  Note
                </label>
                <textarea
                  rows="2"
                  value={form.Note}
                  onChange={(e) => setForm({ ...form, Note: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:outline-none focus:border-[#FC687D]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-full py-3 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-3 rounded-xl bg-[#FC687D] text-white text-xs font-bold disabled:opacity-70"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}