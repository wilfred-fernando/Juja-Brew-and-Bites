"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";

export default function LoyaltyAdminPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Existing search + edit modal states
  const [search, setSearch] = useState("");
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

  // ✅ Link Requests (admin approval)
  const [linkRequests, setLinkRequests] = useState([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkActionBusy, setLinkActionBusy] = useState(null); // request id
  const [selectedMemberByRequestId, setSelectedMemberByRequestId] = useState({});

  useEffect(() => {
    fetchMembers();
    fetchLinkRequests();
  }, []);

  // --------------------
  // FETCH MEMBERS
  // --------------------
  async function fetchMembers() {
    setLoading(true);

    const { data, error } = await supabase.from("loyalty_members").select("*");

    if (error) {
      alert("Error: " + error.message);
      setMembers([]);
      setLoading(false);
      return;
    }

    const sortedData = (data || []).slice().sort((a, b) => {
      const ap = parseFloat(a["Points balance"] || 0) || 0;
      const bp = parseFloat(b["Points balance"] || 0) || 0;
      return bp - ap;
    });

    setMembers(sortedData);
    setLoading(false);
  }

  // --------------------
  // FETCH PENDING LINK REQUESTS
  // --------------------
  async function fetchLinkRequests() {
    setLinkLoading(true);

    const { data, error } = await supabase
      .from("loyalty_link_requests")
      .select("*")
      .eq("status", "pending");

    if (error) {
      console.error(error);
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

  // --------------------
  // ✅ APPROVE LINK REQUEST
  // Updates BOTH:
  // - loyalty_members.user_id
  // - profiles.loyalty_account_id
  // --------------------
  const approveLinkRequest = async (request) => {
    const requestId = request.id;
    const userId = request.user_id;

    const memberId =
      request.member_id || selectedMemberByRequestId[requestId] || null;

    if (!userId) {
      alert("This request has no user_id. Cannot approve.");
      return;
    }

    if (!memberId) {
      alert("Please select a member to link for this request.");
      return;
    }

    setLinkActionBusy(requestId);

    try {
      // 1) Load loyalty member row (prevent overwriting)
      const { data: memberRow, error: memberErr } = await supabase
        .from("loyalty_members")
        .select("id, user_id, customer_name, customer_code")
        .eq("id", memberId)
        .single();

      if (memberErr) throw memberErr;

      if (memberRow?.user_id) {
        alert(
          "⚠️ This loyalty member is already linked. Unlink first, then approve again."
        );
        return;
      }

      // 2) Check if user is already linked to another loyalty member
      const { data: existingMemberLink, error: existingMemberErr } =
        await supabase
          .from("loyalty_members")
          .select("id, customer_name, customer_code")
          .eq("user_id", userId)
          .maybeSingle();

      if (!existingMemberErr && existingMemberLink?.id) {
        alert(
          `⚠️ This user is already linked to another member (${existingMemberLink.customer_name || "Unknown"} / ${existingMemberLink.customer_code || existingMemberLink.id}). Unlink first.`
        );
        return;
      }

      // 3) Check profiles row + prevent overriding loyalty_account_id
      const { data: profileRow, error: profileErr } = await supabase
        .from("profiles")
        .select("id, loyalty_account_id, email, full_name, role")
        .eq("id", userId)
        .single();

      if (profileErr) throw profileErr;

      if (profileRow?.loyalty_account_id) {
        alert(
          `⚠️ This user already has loyalty_account_id = ${profileRow.loyalty_account_id}. Unlink first.`
        );
        return;
      }

      // 4) Link loyalty member to user
      const { error: linkErr } = await supabase
        .from("loyalty_members")
        .update({ user_id: userId })
        .eq("id", memberId);

      if (linkErr) throw linkErr;

      // 5) Link profile to loyalty member (your schema column)
      const { error: profLinkErr } = await supabase
        .from("profiles")
        .update({ loyalty_account_id: memberId })
        .eq("id", userId);

      if (profLinkErr) {
        // rollback the member link if profile update fails
        await supabase
          .from("loyalty_members")
          .update({ user_id: null })
          .eq("id", memberId);

        throw profLinkErr;
      }

      // 6) Mark request approved
      const { error: reqErr } = await supabase
        .from("loyalty_link_requests")
        .update({
          status: "approved",
          matched_member_id: memberId,
        })
        .eq("id", requestId);

      if (reqErr) throw reqErr;

      await fetchMembers();
      await fetchLinkRequests();
    } catch (err) {
      alert("Approve failed: " + (err?.message || "Unknown error"));
    } finally {
      setLinkActionBusy(null);
    }
  };

  // --------------------
  // REJECT LINK REQUEST
  // --------------------
  const rejectLinkRequest = async (requestId) => {
    setLinkActionBusy(requestId);
    try {
      const { error } = await supabase
        .from("loyalty_link_requests")
        .update({ status: "rejected" })
        .eq("id", requestId);

      if (error) throw error;

      await fetchLinkRequests();
    } catch (err) {
      alert("Reject failed: " + (err?.message || "Unknown error"));
    } finally {
      setLinkActionBusy(null);
    }
  };

  // --------------------
  // ✅ UNLINK MEMBER (clears BOTH tables)
  // - loyalty_members.user_id = null
  // - profiles.loyalty_account_id = null
  // --------------------
  const unlinkMember = async (member) => {
    if (
      !confirm(
        `Unlink this member?\n\n${member?.customer_name || "Member"} (${member?.customer_code || member?.id})`
      )
    )
      return;

    const userId = member?.user_id || null;

    try {
      // 1) Unlink member
      const { error: unlinkErr } = await supabase
        .from("loyalty_members")
        .update({ user_id: null })
        .eq("id", member.id);

      if (unlinkErr) throw unlinkErr;

      // 2) Unlink profile if we know userId
      if (userId) {
        const { error: profErr } = await supabase
          .from("profiles")
          .update({ loyalty_account_id: null })
          .eq("id", userId);

        if (profErr) throw profErr;
      }

      // 3) Safety clean-up: any profile pointing at this loyalty member id
      await supabase
        .from("profiles")
        .update({ loyalty_account_id: null })
        .eq("loyalty_account_id", member.id);

      await fetchMembers();
    } catch (err) {
      alert("Unlink failed: " + (err?.message || "Unknown error"));
    }
  };

  // --------------------
  // EDIT MODAL
  // --------------------
  const openModal = (member) => {
    setEditingMember(member);
    setForm({
      customer_name: member["customer_name"] || "",
      Phone: member["Phone"] || "",
      "Points balance": member["Points balance"] || 0,
      "Total visits": member["Total visits"] || 0,
      Note: member["Note"] || "",
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { error } = await supabase
        .from("loyalty_members")
        .update(form)
        .eq("id", editingMember.id);

      if (error) throw error;

      await fetchMembers();
      setIsModalOpen(false);
    } catch (error) {
      alert("Error saving member: " + (error?.message || "Unknown error"));
    }

    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to remove this member? This cannot be undone.")) return;
    const { error } = await supabase.from("loyalty_members").delete().eq("id", id);
    if (error) {
      alert("Delete failed: " + error.message);
      return;
    }
    fetchMembers();
  };

  // --------------------
  // FILTER MEMBERS
  // --------------------
  const filteredMembers = useMemo(() => {
    const s = (search || "").toLowerCase();
    return members.filter((m) => {
      const n = String(m["customer_name"] || "").toLowerCase();
      const c = String(m["customer_code"] || "").toLowerCase();
      const p = String(m["Phone"] || "");
      return n.includes(s) || c.includes(s) || p.includes(search || "");
    });
  }, [members, search]);

  if (loading)
    return (
      <div className="p-8 flex justify-center">
        <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
      </div>
    );

  return (
    <div className="max-w-5xl mx-auto animate-in fade-in duration-500 pb-24 px-3 md:px-8">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-6 mb-6 md:mb-8 pt-4 md:pt-6">
        <div>
          <h1 className="text-2xl md:text-4xl font-normal text-slate-800 tracking-tight leading-none">
            JUJA LOYALTY PROGRAM
          </h1>
          <p className="text-slate-400 text-xs md:text-sm font-medium mt-1 md:mt-2">
            Managing {members.length} loyal customers
          </p>
        </div>
      </header>

      {/* ===================== */}
      {/* ✅ ADMIN LINK REQUESTS */}
      {/* ===================== */}
      <section className="mb-6 md:mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm md:text-base font-normal text-slate-700 tracking-tight">
            Admin Approval: Link Requests
          </h2>
          <button
            onClick={fetchLinkRequests}
            className="px-3 py-2 bg-slate-50 border border-slate-100 text-[10px] md:text-xs font-normal text-slate-500 hover:text-[#FC687D] hover:bg-rose-50 hover:border-rose-100 rounded-lg md:rounded-xl transition-all active:scale-95"
          >
            Refresh
          </button>
        </div>

        <div className="bg-white rounded-xl md:rounded-[20px] border border-rose-50 shadow-sm p-4 md:p-5">
          {linkLoading ? (
            <div className="text-slate-400 text-xs">Loading requests...</div>
          ) : linkRequests.length === 0 ? (
            <div className="text-slate-400 font-normal uppercase tracking-[0.15em] text-[10px] md:text-xs">
              No pending link requests
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {linkRequests.map((req) => (
                <div
                  key={req.id}
                  className="border border-slate-100 rounded-xl p-3 md:p-4 bg-[#FFF9FA]"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] md:text-xs font-mono text-slate-500 bg-white/60 px-2 py-0.5 rounded-md border border-rose-100">
                          Request ID: {req.id}
                        </span>
                        <span className="text-slate-300 text-[10px]">•</span>
                        <span className="text-[10px] md:text-xs text-slate-600">
                          User ID: <span className="font-mono">{req.user_id || "N/A"}</span>
                        </span>
                      </div>

                      <div className="mt-2 text-[10px] md:text-xs text-slate-500">
                        Requested Member ID:{" "}
                        <span className="font-mono">{req.member_id || "Not provided"}</span>
                        {req.created_at && (
                          <>
                            <span className="text-slate-300 mx-2">•</span>
                            <span>Created: {new Date(req.created_at).toLocaleString()}</span>
                          </>
                        )}
                      </div>

                      {!req.member_id && (
                        <div className="mt-3">
                          <label className="block text-[10px] font-normal uppercase tracking-widest text-slate-400 mb-1.5 ml-1">
                            Select Member to Link
                          </label>
                          <select
                            value={selectedMemberByRequestId[req.id] || ""}
                            onChange={(e) =>
                              setSelectedMemberByRequestId((prev) => ({
                                ...prev,
                                [req.id]: e.target.value,
                              }))
                            }
                            className="w-full bg-white border border-rose-100 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all"
                          >
                            <option value="">-- choose member --</option>
                            {members.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.customer_name || "Unknown"} • {m.customer_code || m.id}
                                {m.user_id ? " (already linked)" : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 md:gap-3">
                      <button
                        onClick={() => approveLinkRequest(req)}
                        disabled={linkActionBusy === req.id}
                        className="px-3 md:px-4 py-2 bg-[#FC687D] text-white text-[10px] md:text-xs font-normal uppercase tracking-widest rounded-lg md:rounded-xl hover:bg-rose-500 transition-all active:scale-95 disabled:opacity-60"
                      >
                        {linkActionBusy === req.id ? "Working..." : "Approve"}
                      </button>
                      <button
                        onClick={() => rejectLinkRequest(req.id)}
                        disabled={linkActionBusy === req.id}
                        className="px-3 md:px-4 py-2 bg-white border border-slate-200 text-slate-500 text-[10px] md:text-xs font-normal uppercase tracking-widest rounded-lg md:rounded-xl hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* SEARCH */}
      <div className="relative mb-6 md:mb-8">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
          🔍
        </span>
        <input
          type="text"
          placeholder="Search by name, ID, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 md:py-3.5 bg-white border border-slate-100 rounded-xl md:rounded-2xl text-xs md:text-sm font-semibold focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all shadow-sm"
        />
      </div>

      {/* MEMBERS LIST */}
      <div className="flex flex-col gap-3 md:gap-4">
        {filteredMembers.map((member) => (
          <div
            key={member.id}
            className="bg-white rounded-xl md:rounded-[20px] border border-rose-50 shadow-sm p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-all duration-300 group cursor-default"
          >
            <div className="flex items-center gap-4 md:gap-5 flex-1">
              <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gradient-to-br from-rose-50 to-[#FFF9FA] flex items-center justify-center relative overflow-hidden flex-shrink-0 border border-rose-100/50">
                <span className="text-xl md:text-2xl text-[#FC687D] opacity-80">👤</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-normal text-slate-800 text-sm md:text-base leading-tight truncate">
                    {member["customer_name"] || "Unknown Member"}
                  </h3>

                  {Number(member["Points balance"] || 0) >= 500 && (
                    <span className="bg-[#FFF9FA] text-[#FC687D] text-[9px] font-normal uppercase tracking-widest px-2 py-0.5 rounded-md border border-rose-100">
                      VIP
                    </span>
                  )}

                  {member.user_id ? (
                    <span className="bg-green-50 text-green-700 text-[9px] font-normal uppercase tracking-widest px-2 py-0.5 rounded-md border border-green-100">
                      Linked
                    </span>
                  ) : (
                    <span className="bg-slate-50 text-slate-500 text-[9px] font-normal uppercase tracking-widest px-2 py-0.5 rounded-md border border-slate-100">
                      Not linked
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-normal text-slate-500 text-[10px] md:text-xs bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                    {member["customer_code"]}
                  </span>
                  <span className="text-slate-300 text-[10px]">•</span>
                  <span className="text-[10px] md:text-xs font-normal text-slate-500">
                    {member["Phone"] || "No phone"}
                  </span>

                  {member.user_id && (
                    <>
                      <span className="text-slate-300 text-[10px]">•</span>
                      <span className="text-[10px] md:text-xs font-normal text-slate-500">
                        user_id: <span className="font-mono">{member.user_id}</span>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-4 md:gap-8 pt-3 md:pt-0 border-t md:border-none border-slate-50">
              <div className="flex gap-4 md:gap-6">
                <div className="text-center md:text-right">
                  <p className="text-[9px] md:text-[10px] font-normal uppercase tracking-widest text-slate-400 mb-0.5">
                    Points
                  </p>
                  <p className="text-[#FC687D] font-normal text-base md:text-lg leading-none">
                    {Number(member["Points balance"] || 0).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>

                <div className="w-px bg-slate-100 hidden md:block" />

                <div className="text-center md:text-right">
                  <p className="text-[9px] md:text-[10px] font-normal uppercase tracking-widest text-slate-400 mb-0.5">
                    Visits
                  </p>
                  <p className="text-slate-700 font-normal text-base md:text-lg leading-none">
                    {member["Total visits"] || 0}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 md:gap-2">
                <button
                  onClick={() => openModal(member)}
                  className="px-3 md:px-4 py-2 bg-slate-50 border border-slate-100 text-[10px] md:text-xs font-normal text-slate-500 hover:text-[#FC687D] hover:bg-rose-50 hover:border-rose-100 rounded-lg md:rounded-xl transition-all active:scale-95"
                >
                  Edit
                </button>

                {member.user_id && (
                  <button
                    onClick={() => unlinkMember(member)}
                    className="px-3 md:px-4 py-2 bg-red-50 border border-red-100 text-[10px] md:text-xs font-normal text-red-600 hover:bg-red-100 rounded-lg md:rounded-xl transition-all active:scale-95"
                  >
                    Unlink
                  </button>
                )}

                <button
                  onClick={() => handleDelete(member.id)}
                  className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center bg-slate-50 border border-slate-100 text-[10px] md:text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-100 rounded-lg md:rounded-xl transition-all active:scale-90 md:opacity-0 md:group-hover:opacity-100"
                >
                  🗑
                </button>
              </div>
            </div>
          </div>
        ))}

        {filteredMembers.length === 0 && (
          <div className="text-center py-12 md:py-20 text-slate-400 font-normal uppercase tracking-[0.15em] text-[10px] md:text-xs border border-dashed border-slate-200/60 rounded-xl md:rounded-2xl bg-white/50">
            No members found
          </div>
        )}
      </div>

      {/* EDIT MODAL */}
      {isModalOpen && editingMember && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-white w-full max-w-md rounded-t-[24px] md:rounded-[28px] p-5 md:p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5 md:hidden" />

            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl md:text-2xl font-normal text-slate-800 tracking-tight">
                  Edit Member
                </h3>
                <p className="font-mono text-[10px] font-normal text-slate-400 mt-1">
                  {editingMember["customer_code"]}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-all active:scale-90"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 md:space-y-5">
              <div>
                <label className="block text-[10px] font-normal uppercase tracking-widest text-slate-400 mb-1.5 ml-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs md:text-sm font-semibold focus:bg-white focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-normal uppercase tracking-widest text-slate-400 mb-1.5 ml-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={form.Phone}
                  onChange={(e) => setForm({ ...form, Phone: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs md:text-sm font-semibold focus:bg-white focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 md:gap-4">
                <div className="bg-[#FFF9FA] p-3 md:p-4 rounded-xl border border-rose-100">
                  <label className="block text-[10px] font-normal uppercase tracking-widest text-[#FC687D] mb-2">
                    Points Balance
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={form["Points balance"]}
                    onChange={(e) => setForm({ ...form, "Points balance": e.target.value })}
                    className="w-full bg-white border border-rose-200 rounded-lg px-3 py-2 text-sm font-normal text-slate-800 focus:outline-none focus:border-[#FC687D] transition-all text-center"
                  />
                </div>

                <div className="bg-slate-50 p-3 md:p-4 rounded-xl border border-slate-100">
                  <label className="block text-[10px] font-normal uppercase tracking-widest text-slate-500 mb-2">
                    Total Visits
                  </label>
                  <input
                    type="number"
                    required
                    value={form["Total visits"]}
                    onChange={(e) => setForm({ ...form, "Total visits": e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-normal text-slate-800 focus:outline-none focus:border-slate-400 transition-all text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-normal uppercase tracking-widest text-slate-400 mb-1.5 ml-1">
                  Admin Notes / Birthday
                </label>
                <textarea
                  rows="2"
                  value={form.Note}
                  onChange={(e) => setForm({ ...form, Note: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs md:text-sm font-normal focus:bg-white focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-rose-100 transition-all resize-none"
                  placeholder="e.g. Birthday: 1995-12-25"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 md:pt-4 mt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-full py-3.5 rounded-xl bg-white border border-slate-200 text-slate-500 font-normal uppercase tracking-widest text-[10px] md:text-xs hover:bg-slate-50 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-3.5 rounded-xl bg-[#FC687D] text-white font-normal uppercase tracking-widest text-[10px] md:text-xs hover:bg-rose-500 transition-all shadow-sm disabled:opacity-70 active:scale-95"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
``