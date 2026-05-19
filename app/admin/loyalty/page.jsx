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
  // LIST SEARCH (top search)
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
  // INITIAL LOAD
  // =========================
  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchMembers();
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

  // =========================
  // SEARCH: Profiles by email/full_name
  // =========================
  useEffect(() => {
    // debounce
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

      // Prefer admins? NO — keep all, we are linking customers too.
      setUserOptions(data || []);
    }, 250);

    return () => clearTimeout(userTimer.current);
  }, [userQuery]);

  // =========================
  // SEARCH: Loyalty members by name/code
  // =========================
  useEffect(() => {
    if (memberTimer.current) clearTimeout(memberTimer.current);

    memberTimer.current = setTimeout(async () => {
      const q = memberQuery.trim();
      if (q.length < 2) {
        setMemberOptions([]);
        return;
      }

      // Search by customer_name or customer_code
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
  // FILTER + SPLIT LINKED/UNLINKED
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

  const linkedMembers = useMemo(
    () => filteredMembers.filter((m) => !!m.user_id),
    [filteredMembers]
  );

  const unlinkedMembers = useMemo(
    () => filteredMembers.filter((m) => !m.user_id),
    [filteredMembers]
  );

  // =========================
  // EDIT / DELETE
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
    } catch (err) {
      alert("Error saving member: " + (err?.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Remove this loyalty member? This cannot be undone.")) return;

    setActionBusy(true);
    setNotice("");

    try {
      // If linked, unlink first to keep data consistent
      const member = members.find((m) => m.id === id);
      if (member?.user_id) {
        await unlinkMember(member, { silent: true });
      }

      const { error } = await supabase.from("loyalty_members").delete().eq("id", id);
      if (error) throw error;

      await fetchMembers();
    } catch (err) {
      alert("Delete failed: " + (err?.message || "Unknown error"));
    } finally {
      setActionBusy(false);
    }
  };

  // =========================
  // ✅ MANUAL LINK (email/user + loyalty member)
  // Updates BOTH:
  // - loyalty_members.user_id
  // - profiles.loyalty_account_id
  // =========================
  async function manualLink() {
    setNotice("");

    if (!selectedUser?.id || !selectedMember?.id) {
      setNotice("Please select BOTH a user (email) and a loyalty member.");
      return;
    }

    setActionBusy(true);

    try {
      // 1) Ensure member is not already linked
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

      // 2) Ensure user not linked to other member
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

      // 3) Ensure profile doesn’t already have loyalty_account_id
      const { data: pRow, error: pErr } = await supabase
        .from("profiles")
        .select("id,loyalty_account_id,email,full_name")
        .eq("id", selectedUser.id)
        .single();
      if (pErr) throw pErr;
      if (pRow?.loyalty_account_id) {
        setNotice(`⚠️ This user already has loyalty_account_id = ${pRow.loyalty_account_id}. Unlink first.`);
        return;
      }

      // 4) Link member -> user
      const { error: linkErr } = await supabase
        .from("loyalty_members")
        .update({ user_id: selectedUser.id })
        .eq("id", selectedMember.id);
      if (linkErr) throw linkErr;

      // 5) Link profile -> member
      const { error: profErr } = await supabase
        .from("profiles")
        .update({ loyalty_account_id: selectedMember.id })
        .eq("id", selectedUser.id);

      if (profErr) {
        // rollback
        await supabase.from("loyalty_members").update({ user_id: null }).eq("id", selectedMember.id);
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
      setNotice("Manual link failed: " + (err?.message || "Unknown error"));
    } finally {
      setActionBusy(false);
    }
  }

  // =========================
  // ✅ UNLINK (clears BOTH tables)
  // =========================
  async function unlinkMember(member, { silent = false } = {}) {
    if (!member?.id) return;

    if (!silent) {
      const ok = confirm(
        `Unlink this member?\n\n${member.customer_name || "Member"} (${member.customer_code || member.id})`
      );
      if (!ok) return;
    }

    const memberId = member.id;
    const userId = member.user_id;

    // 1) Clear loyalty_members.user_id
    const { error: uErr } = await supabase
      .from("loyalty_members")
      .update({ user_id: null })
      .eq("id", memberId);

    if (uErr) throw uErr;

    // 2) Clear profiles.loyalty_account_id by user id (if known)
    if (userId) {
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ loyalty_account_id: null })
        .eq("id", userId);
      if (pErr) throw pErr;
    }

    // 3) Safety cleanup: any profile pointing to this loyalty member id
    await supabase.from("profiles").update({ loyalty_account_id: null }).eq("loyalty_account_id", memberId);

    if (!silent) {
      setNotice("✅ Unlinked successfully.");
      await fetchMembers();
    }
  }

  // =========================
  // UI Helpers
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
              onClick={() => unlinkMember(member)}
              disabled={actionBusy}
              className="px-3 py-2 bg-red-50 border border-red-100 text-xs text-red-600 rounded-xl hover:bg-red-100 active:scale-95 disabled:opacity-60"
            >
              Unlink
            </button>
          )}

          <button
            onClick={() => handleDelete(member.id)}
            disabled={actionBusy}
            className="px-3 py-2 bg-white border border-slate-200 text-xs text-slate-500 rounded-xl hover:bg-slate-50 active:scale-95 disabled:opacity-60"
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
          JUJA LOYALTY PROGRAM (Admin)
        </h1>
        <p className="text-slate-400 text-xs md:text-sm mt-2">
          Members: {members.length} • Linked: {linkedMembers.length} • Not linked: {unlinkedMembers.length}
        </p>

        {notice && (
          <div className="mt-4 bg-rose-50 border border-rose-100 text-slate-700 rounded-xl p-3 text-sm">
            {notice}
          </div>
        )}
      </header>

      {/* ✅ MANUAL LINK */}
      <section className="bg-white border border-rose-100 rounded-2xl p-4 md:p-5">
        <h2 className="text-sm md:text-base font-semibold text-slate-800">
          Manual Link
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Select a user by email (type to search), then select a loyalty member (type to search), then link.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          {/* USER SEARCH */}
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
                    <div className="font-semibold text-slate-800">
                      {u.email || "(no email)"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {u.full_name || u.id} {u.loyalty_account_id ? " • (already linked)" : ""}
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

          {/* MEMBER SEARCH */}
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
                      {m.user_id ? "(already linked)" : "Not linked"} • {m.Email || ""} {m.Phone ? `• ${m.Phone}` : ""}
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

      {/* LIST SEARCH */}
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

      {/* ✅ LINKED */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700">Linked Accounts</h2>
          <span className="text-xs text-slate-400">{linkedMembers.length}</span>
        </div>

        {linkedMembers.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm bg-white/60 border border-dashed border-slate-200 rounded-2xl">
            No linked members found
          </div>
        ) : (
          linkedMembers.map((m) => <MemberCard key={m.id} member={m} />)
        )}
      </section>

      {/* ✅ NOT LINKED */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700">Not Linked</h2>
          <span className="text-xs text-slate-400">{unlinkedMembers.length}</span>
        </div>

        {unlinkedMembers.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm bg-white/60 border border-dashed border-slate-200 rounded-2xl">
            No unlinked members found
          </div>
        ) : (
          unlinkedMembers.map((m) => <MemberCard key={m.id} member={m} />)
        )}
      </section>

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