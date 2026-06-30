"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { applyAnnualPointResetToMember, resetMemberPointsIfExpired } from "@/lib/loyalty/annualReset";

const supabase = getSupabaseClient();

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

  // ✅ include Available points
  const [form, setForm] = useState({
    customer_name: "",
    Phone: "",
    "Points balance": 0,
    "Available points": 0,
    "Total visits": 0,
    Note: "",
  });

  const [saving, setSaving] = useState(false);
  const [pointsAdd, setPointsAdd] = useState(0);
  const [pointsDeduct, setPointsDeduct] = useState(0);

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
  const [purchaseHistory, setPurchaseHistory] = useState({
    open: false,
    loading: false,
    member: null,
    rows: [],
    error: "",
  });
  const [voucherView, setVoucherView] = useState({
    open: false,
    loading: false,
    member: null,
    status: "available",
    rows: [],
    error: "",
  });
  const [voucherStatusBusyId, setVoucherStatusBusyId] = useState("");

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

  function peso(value) {
    return Number(value || 0).toLocaleString("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function displayDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function memberValue(member, keys, fallback = "—") {
    for (const key of keys) {
      const value = member?.[key];
      if (value !== null && value !== undefined && String(value).trim() !== "") return value;
    }
    return fallback;
  }

  function displayDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(date);
  }

  function getVoucherStatus(voucher) {
    const status = String(voucher?.status || "").toLowerCase();
    const redeemedAt = voucher?.redeemed_at;
    const expiresAt = voucher?.expires_at;
    const expiryMs = expiresAt ? new Date(expiresAt).getTime() : 0;

    if (status === "redeemed" || redeemedAt) return "redeemed";
    if (status === "expired" || (expiryMs && expiryMs < Date.now())) return "expired";
    return "available";
  }

  function voucherStatusLabel(status) {
    if (status === "redeemed") return "Redeemed";
    if (status === "expired") return "Expired";
    return "Available";
  }

  async function openVoucherList(member, status = "available") {
    setVoucherView({ open: true, loading: true, member, status, rows: [], error: "" });

    try {
      if (status === "available" && member?.id) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData?.session?.access_token;
          await fetch("/api/admin/loyalty-point-vouchers", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify({ memberId: member.id }),
          });
        } catch (voucherErr) {
          console.warn("Voucher allocation refresh skipped:", voucherErr?.message || voucherErr);
        }
      }

      const { data, error } = await supabase
        .from("vouchers")
        .select("id, member_id, code, reward_text, reward_type, status, issued_at, expires_at, redeemed_at")
        .eq("member_id", member.id)
        .order("issued_at", { ascending: false });

      if (error) throw error;

      const rows = (data || []).filter((voucher) => getVoucherStatus(voucher) === status);
      setVoucherView({ open: true, loading: false, member, status, rows, error: "" });
    } catch (err) {
      setVoucherView({
        open: true,
        loading: false,
        member,
        status,
        rows: [],
        error: err?.message || "Unable to load vouchers.",
      });
    }
  }

  async function updateVoucherStatus(voucher, nextStatus) {
    if (!voucher?.id || !nextStatus) return;
    const normalized = String(nextStatus).toLowerCase();

    setVoucherStatusBusyId(voucher.id);
    setVoucherView((prev) => ({ ...prev, error: "" }));

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const response = await fetch("/api/admin/voucher-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ voucherId: voucher.id, status: normalized }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to update voucher status.");

      setNotice(`✅ Voucher changed to ${voucherStatusLabel(normalized)}.`);
      await openVoucherList(voucherView.member, normalized);
    } catch (err) {
      setVoucherView((prev) => ({
        ...prev,
        error: err?.message || "Unable to update voucher status.",
      }));
    } finally {
      setVoucherStatusBusyId("");
    }
  }

  async function openPurchaseHistory(member) {
    setPurchaseHistory({ open: true, loading: true, member, rows: [], error: "" });

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const response = await fetch("/api/admin/customer-purchase-history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ memberId: member?.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to load purchase history.");
      const rows = payload.rows || [];
      setPurchaseHistory({ open: true, loading: false, member, rows, error: "" });
    } catch (err) {
      setPurchaseHistory({ open: true, loading: false, member, rows: [], error: err?.message || "Unable to load purchase history." });
    }
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

    const resetRows = await Promise.all((data || []).map(async (row) => {
      try {
        const result = await resetMemberPointsIfExpired(supabase, row);
        return result.member || row;
      } catch (resetErr) {
        console.warn("Annual loyalty point reset skipped:", resetErr);
        return applyAnnualPointResetToMember(row);
      }
    }));

    const sorted = resetRows.slice().sort((a, b) => {
      const ap = parseFloat(a["Points balance"] || 0) || 0;
      const bp = parseFloat(b["Points balance"] || 0) || 0;
      return bp - ap;
    });

    setMembers(sorted);
  }

  // =========================
  // FETCH LINK REQUESTS + PROFILES
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
      setNotice(`Unable to load loyalty link requests: ${error.message}`);
      setLinkRequests([]);
      setLoadingRequests(false);
      return;
    }

    const reqs = data || [];
    const userIds = Array.from(new Set(reqs.map((r) => r.user_id).filter(Boolean)));
    const matchedMemberIds = Array.from(new Set(reqs.map((r) => r.matched_member_id).filter(Boolean)));
    let profileMap = {};
    let linkedMemberMap = {};

    if (userIds.length > 0) {
      const { data: pData, error: pErr } = await supabase
        .from("profiles")
        .select("id,email,full_name,loyalty_account_id")
        .in("id", userIds);

      if (!pErr) {
        (pData || []).forEach((p) => {
          profileMap[p.id] = {
            full_name: p.full_name || "",
            email: p.email || "",
            loyalty_account_id: p.loyalty_account_id || "",
          };
        });
        setProfilesById(profileMap);
      }
    }

    if (matchedMemberIds.length > 0) {
      const { data: memberData } = await supabase
        .from("loyalty_members")
        .select("id,user_id")
        .in("id", matchedMemberIds);

      (memberData || []).forEach((member) => {
        linkedMemberMap[member.id] = member.user_id || "";
      });
    }

    const unresolvedReqs = reqs.filter((req) => {
      const profile = profileMap[req.user_id];
      const profileAlreadyLinked = profile?.loyalty_account_id && (
        !req.matched_member_id || String(profile.loyalty_account_id) === String(req.matched_member_id)
      );
      const memberAlreadyLinked = req.matched_member_id && String(linkedMemberMap[req.matched_member_id] || "") === String(req.user_id || "");
      return !(profileAlreadyLinked || memberAlreadyLinked);
    });

    setLinkRequests(unresolvedReqs);

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
        return name.includes(q) || code.includes(q) || phone.includes(q) || city.includes(q);
      })
      .slice(0, 8);
  }

  // =========================
  // APPROVE REQUEST (links BOTH tables)
  // =========================
  async function approveRequest(req) {
    const requestId = req.id;
    const userId = req.user_id;

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
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const res = await fetch("/api/admin/loyalty-link-approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ requestId, userId, chosenMemberId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Unable to approve loyalty link request.");

      setLinkRequests((prev) => prev.filter((r) => r.id !== requestId));
      const pointCreated = Number(json?.pointVouchersCreated || 0);
      const welcomeCreated = Number(json?.welcomeVoucherCreated || 0);
      const messages = [];
      if (welcomeCreated > 0) messages.push("welcome voucher created");
      if (pointCreated > 0) messages.push(`${pointCreated} point voucher${pointCreated === 1 ? "" : "s"} created`);
      setNotice(`Approved and linked successfully.${messages.length ? ` ${messages.join(", ")}.` : ""}`);
      await Promise.all([fetchMembers(), fetchLinkRequests()]);
      return;

      const { data: memberRow, error: memberErr } = await supabase
        .from("loyalty_members")
        .select("id,user_id,customer_name,customer_code")
        .eq("id", chosenMemberId)
        .limit(1)
        .maybeSingle();

      if (memberErr) throw memberErr;
      if (!memberRow?.id) {
        setNotice("⚠️ Selected loyalty member was not found. Refresh and try again.");
        return;
      }

      if (memberRow?.user_id) {
        setNotice("⚠️ This loyalty member is already linked. Unlink first.");
        return;
      }

      const { data: profileRow, error: profileErr } = await supabase
        .from("profiles")
        .select("id,loyalty_account_id")
        .eq("id", userId)
        .limit(1)
        .maybeSingle();

      if (profileErr) throw profileErr;
      if (!profileRow?.id) {
        setNotice("⚠️ Customer profile was not found. Ask the customer to log in again, then resend the request.");
        return;
      }

      if (profileRow?.loyalty_account_id) {
        setNotice(
          `⚠️ This user already has loyalty_account_id = ${profileRow.loyalty_account_id}. Unlink first.`
        );
        return;
      }

      const { error: linkErr } = await supabase
        .from("loyalty_members")
        .update({ user_id: userId })
        .eq("id", chosenMemberId);
      if (linkErr) throw linkErr;

      const { error: profLinkErr } = await supabase
        .from("profiles")
        .update({ loyalty_account_id: chosenMemberId })
        .eq("id", userId);

      if (profLinkErr) {
        await supabase
          .from("loyalty_members")
          .update({ user_id: null })
          .eq("id", chosenMemberId);
        throw profLinkErr;
      }

      const { error: reqErr } = await supabase
        .from("loyalty_link_requests")
        .update({
          status: "approved",
          matched_member_id: chosenMemberId,
          approved_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (reqErr) throw reqErr;

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
    setNotice("");

    try {
      const { error } = await supabase
        .from("loyalty_link_requests")
        .update({
          status: "rejected",
          rejected_at: new Date().toISOString(),
        })
        .eq("id", req.id);

      if (error) throw error;

      setLinkRequests((prev) => prev.filter((r) => r.id !== req.id));
      setNotice("✅ Rejected + removed from list");
    } catch (err) {
      setNotice("❌ Reject failed: " + (err?.message || "Unknown error"));
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
    const activeMember = applyAnnualPointResetToMember(member);
    setEditingMember(activeMember);

    setForm({
      customer_name: activeMember.customer_name || activeMember["customer_name"] || "",
      Phone: activeMember["Phone"] || "",
      "Points balance": Number(activeMember["Points balance"] || 0),
      "Available points": Number(activeMember["Available points"] || 0),
      "Total visits": Number(activeMember["Total visits"] || 0),
      Note: activeMember["Note"] || "",
    });

    setPointsAdd(0);
    setPointsDeduct(0)

    setIsModalOpen(true);
  };

  // ✅ When admin edits the "Points" field, we update BOTH total and available.
  const setPointsBoth = (val) => {
    const n = Number(val || 0);
    setForm((f) => ({
      ...f,
      "Points balance": n,
      "Available points": n,
    }));
  };

  const handleSave = async (e) => {
  e.preventDefault();
  if (!editingMember?.id) return;

  setSaving(true);
  setNotice("");

  try {
    const currentTotal = Number(form["Points balance"] || 0);
    const currentAvail = Number(form["Available points"] || 0);

    const add = Number(pointsAdd) || 0;
    const deduct = Number(pointsDeduct) || 0;

    // ✅ Prevent invalid values
    if (add < 0 || deduct < 0) {
      setNotice("⚠️ Add/Deduct must not be negative");
      setSaving(false);
      return;
    }

    const delta = add - deduct;

    const newTotal = Math.max(0, currentTotal + delta);
    const newAvail = Math.max(0, currentAvail + delta);

    const updatePayload = {
      customer_name: form.customer_name,
      Phone: form.Phone,
      "Points balance": newTotal,
      "Available points": newAvail,
      "Total visits": Number(form["Total visits"] || 0),
      Note: form.Note,
    };

    const { data, error } = await supabase
      .from("loyalty_members")
      .update(updatePayload)
      .eq("id", editingMember.id)
      .select()
      .single();

    if (error) {
      console.error("UPDATE ERROR:", error);
      throw error;
    }

    // ✅ instant UI update
    setMembers((prev) =>
      prev.map((m) => (m.id === data.id ? data : m))
    );

    setEditingMember(data);
    setIsModalOpen(false);

    setNotice(
      `✅ Updated: Total ${currentTotal} → ${newTotal}, Available ${currentAvail} → ${newAvail}`
    );
  } catch (err) {
    console.error(err);
    setNotice("❌ Error saving: " + (err?.message || "Unknown error"));
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

      const { error } = await supabase.from("loyalty_members").delete().eq("id", member.id);
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
        .eq("id", selectedMember.id)
        .is("user_id", null);

      if (linkErr) throw linkErr;

      const { data: linkedRow, error: linkedCheckErr } = await supabase
        .from("loyalty_members")
        .select("id,user_id")
        .eq("id", selectedMember.id)
        .maybeSingle();

      if (linkedCheckErr) throw linkedCheckErr;
      if (String(linkedRow?.user_id || "") !== String(selectedUser.id)) {
        setNotice("⚠️ Selected loyalty member was linked by another customer account. Refresh and try again.");
        return;
      }

      const { error: profErr } = await supabase
        .from("profiles")
        .update({ loyalty_account_id: selectedMember.id })
        .eq("id", selectedUser.id);

      if (profErr) {
        await supabase.from("loyalty_members").update({ user_id: null }).eq("id", selectedMember.id);
        throw profErr;
      }

      let voucherMessage = "";
      try {
        const voucherRes = await fetch("/api/admin/loyalty-point-vouchers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberId: selectedMember.id }),
        });
        const voucherJson = await voucherRes.json().catch(() => ({}));
        if (!voucherRes.ok) throw new Error(voucherJson?.error || "Unable to allocate point vouchers.");
        const pointCreated = Number(voucherJson?.pointVouchersCreated || 0);
        const welcomeCreated = Number(voucherJson?.welcomeVoucherCreated || 0);
        const messages = [];
        if (welcomeCreated > 0) messages.push("welcome voucher created");
        if (pointCreated > 0) messages.push(`${pointCreated} point voucher${pointCreated === 1 ? "" : "s"} created`);
        if (messages.length) voucherMessage = ` ${messages.join(", ")}.`;
      } catch (voucherErr) {
        voucherMessage = ` Voucher allocation skipped: ${voucherErr?.message || "Unknown error"}.`;
      }

      setNotice(`✅ Linked successfully.${voucherMessage}`);
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
    const totalPts = Number(member["Points balance"] || 0);
    const availPts = Number(member["Available points"] || 0);
    const visits = Number(member["Total visits"] || 0);

    return (
      <div className="bg-white rounded-xl md:rounded-[20px] border border-sky-50 shadow-sm p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
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
            Code: <span className="font-mono">{member.customer_code || member["customer_code"] || "-"}</span>
            {" | "}
            Phone: <span className="font-mono">{member["Phone"] || "-"}</span>
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Total: <span className="font-mono">{totalPts}</span>
            {" | "}
            Available: <span className="font-mono">{availPts}</span>
            {" | "}
            Visits: <span className="font-mono">{visits}</span>
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Spent: <span className="font-mono">{peso(memberValue(member, ["Total spent", "total_spent"], 0))}</span>
            {" | "}
            First: <span className="font-mono">{displayDateTime(memberValue(member, ["First visit", "first_visit"]))}</span>
            {" | "}
            Last: <span className="font-mono">{displayDateTime(memberValue(member, ["Last visit", "last_visit"]))}</span>
          </p>

          {member.user_id && (
            <p className="mt-1 text-xs text-slate-500">
              user_id: <span className="font-mono">{member.user_id}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => openPurchaseHistory(member)}
            className="px-3 py-2 bg-cyan-50 border border-cyan-100 text-xs text-cyan-800 rounded-xl hover:bg-cyan-100 active:scale-95"
          >
            View Purchase History
          </button>

          <button
            onClick={() => openVoucherList(member, "available")}
            className="px-3 py-2 bg-emerald-50 border border-emerald-100 text-xs text-emerald-700 rounded-xl hover:bg-emerald-100 active:scale-95"
          >
            Vouchers
          </button>

          <button
            onClick={() => openModal(member)}
            className="px-3 py-2 bg-slate-50 border border-slate-100 text-xs text-slate-600 rounded-xl hover:bg-sky-50 hover:text-slate-700 active:scale-95"
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
        <div className="w-8 h-8 border-4 border-sky-200 border-t-[#5b7288] animate-spin rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-24 px-3 md:px-8 space-y-6">
      <header className="pt-4 md:pt-6">
        <h1 className="text-2xl md:text-4xl font-normal text-slate-800 tracking-tight">
          JUJA LOYALTY PROGRAM
        </h1>
        <p className="text-slate-500 text-xs md:text-sm mt-2">
          ADMIN DASHBOARD (Members: {members.length} • Linked: {linkedMembersList.length} • Not linked: {unlinkedMembersList.length})
        </p>

        {notice && (
          <div className="mt-4 bg-sky-50 border border-slate-200 text-slate-700 rounded-xl p-3 text-sm">
            {notice}
          </div>
        )}
      </header>

      {/* ✅ LINK REQUESTS + MANUAL LINK + LISTS + MODALS */}
      {/* Keep the rest of your existing UI below exactly as you already have it.
          The important change requested is already applied:
          - form includes "Available points"
          - editing Points updates both total + available
          - handleSave updates both columns
          - MemberCard shows both */}
      {/* --- Your existing sections below (Link Requests / Manual Link / Search / Lists / Modals) --- */}

      {/* LINK REQUESTS (Pending) */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm md:text-base font-semibold text-slate-800">Link Requests (Pending)</h2>
          <button
            onClick={fetchLinkRequests}
            className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600 hover:bg-sky-50 hover:text-slate-700 active:scale-95"
          >
            Refresh
          </button>
        </div>

        {loadingRequests ? (
          <p className="text-sm text-slate-500 mt-3">Loading requests…</p>
        ) : linkRequests.length === 0 ? (
          <p className="text-sm text-slate-500 mt-3">No pending requests.</p>
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
                        <p className="text-sm font-semibold text-slate-800">{userLabel(req.user_id)}</p>
                        <span className="text-slate-600">•</span>
                        <p className="text-xs text-slate-500">{userSubLabel(req.user_id)}</p>
                      </div>

                      <div className="mt-2 text-xs text-slate-500 space-y-1">
                        <div>Input Name: <span className="font-mono">{req.input_name || "—"}</span></div>
                        <div>Input Birthday: <span className="font-mono">{req.input_birthday || "—"}</span></div>
                        <div>Request ID: <span className="font-mono">{req.id}</span></div>
                      </div>

                      {req.matched_member_id && (
                        <div className="mt-3 bg-[#f0f7fb] border border-slate-200 rounded-xl p-3">
                          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                            Matched Member (Verify)
                          </p>
                          {matched ? (
                            <div className="mt-2 text-sm text-slate-700 space-y-1">
                              <div className="font-semibold text-slate-800">
                                {matched.customer_name || matched["customer_name"] || "Unknown"} •{" "}
                                <span className="font-mono">{matched.customer_code || matched["customer_code"] || matched.id}</span>
                              </div>
                              <div className="text-xs text-slate-600">
                                Phone: <span className="font-mono">{matched["Phone"] || "—"}</span> • City:{" "}
                                <span className="font-mono">{matched["City"] || "—"}</span>
                              </div>
                              <div className="text-xs text-slate-600">
                                Birthday: <span className="font-mono">{matched["Note"] || "—"}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-slate-500">
                              matched_member_id: <span className="font-mono">{req.matched_member_id}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {!req.matched_member_id && (
                        <div className="mt-3">
                          <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                            Search Member to Link
                          </label>

                          <input
                            value={requestMemberQueryById[req.id] || ""}
                            onChange={(e) =>
                              setRequestMemberQueryById((prev) => ({
                                ...prev,
                                [req.id]: e.target.value,
                              }))
                            }
                            placeholder="Type name/code/phone/city…"
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm"
                          />

                          {(requestMemberQueryById[req.id] || "").trim().length > 0 && (
                            <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden bg-white">
                              {requestCandidateList(req.id).length === 0 ? (
                                <div className="px-3 py-2 text-xs text-slate-500">No matches.</div>
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
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-sky-50 ${
                                      selectedMemberByRequestId[req.id] === m.id ? "bg-sky-50" : ""
                                    }`}
                                  >
                                    <div className="font-semibold text-slate-800">
                                      {m.customer_name || m["customer_name"] || "Unknown"} •{" "}
                                      <span className="font-mono">{m.customer_code || m["customer_code"] || m.id}</span>
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
                        className="px-3 py-2 rounded-xl bg-slate-600 text-white text-xs font-bold disabled:opacity-60"
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

      {/* SEARCH */}
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
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
          <span className="text-xs text-slate-500">{linkedMembersList.length}</span>
        </div>
        {linkedMembersList.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm bg-white/60 border border-dashed border-slate-200 rounded-2xl">
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
          <span className="text-xs text-slate-500">{unlinkedMembersList.length}</span>
        </div>
        {unlinkedMembersList.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm bg-white/60 border border-dashed border-slate-200 rounded-2xl">
            No unlinked members found
          </div>
        ) : (
          unlinkedMembersList.map((m) => <MemberCard key={m.id} member={m} />)
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
                <h3 className="text-xl md:text-2xl font-semibold text-slate-800">Edit Member</h3>
                <p className="font-mono text-[10px] text-slate-500 mt-1">
                  {editingMember.customer_code || editingMember["customer_code"] || editingMember.id}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 active:scale-90"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Phone</label>
                <input
                  type="text"
                  value={form.Phone}
                  onChange={(e) => setForm({ ...form, Phone: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Read-only current points */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                      Total Points
                    </label>
                    <input
                      type="number"
                      value={form["Points balance"]}
                      disabled
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm opacity-70 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                      Available Points
                    </label>
                    <input
                      type="number"
                      value={form["Available points"]}
                      disabled
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm opacity-70 cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Add / Deduct */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                      Add Points
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={pointsAdd}
                      onChange={(e) => setPointsAdd(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                      Deduct Points
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={pointsDeduct}
                      onChange={(e) => setPointsDeduct(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                {/* Preview */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-700">Points after save:</p>
                  <p className="mt-1">
                    Total:{" "}
                    <span className="font-mono">
                      {Math.max(0, Number(form["Points balance"] || 0) + (Number(pointsAdd || 0) - Number(pointsDeduct || 0)))}
                    </span>
                    {"  "}•{"  "}
                    Available:{" "}
                    <span className="font-mono">
                      {Math.max(0, Number(form["Available points"] || 0) + (Number(pointsAdd || 0) - Number(pointsDeduct || 0)))}
                    </span>
                  </p>
                </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Visits</label>
                  <input
                    type="number"
                    value={form["Total visits"]}
                    onChange={(e) => setForm({ ...form, "Total visits": e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">Note</label>
                  <input
                    type="text"
                    value={form.Note}
                    onChange={(e) => setForm({ ...form, Note: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
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
                  className="w-full py-3 rounded-xl bg-slate-400/78 text-white text-xs font-bold disabled:opacity-70"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PURCHASE HISTORY MODAL */}
      {purchaseHistory.open && purchaseHistory.member && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setPurchaseHistory((prev) => ({ ...prev, open: false }))}
        >
          <div
            className="bg-white w-full max-w-4xl rounded-t-[24px] md:rounded-[28px] p-5 md:p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start gap-4 mb-5">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Purchase History</p>
                <h3 className="text-xl md:text-2xl font-semibold text-slate-800">
                  {purchaseHistory.member.customer_name || purchaseHistory.member["customer_name"] || "Customer"}
                </h3>
                <p className="font-mono text-[10px] text-slate-500 mt-1">
                  {purchaseHistory.member.customer_code || purchaseHistory.member["customer_code"] || purchaseHistory.member.id}
                </p>
              </div>
              <button
                onClick={() => setPurchaseHistory((prev) => ({ ...prev, open: false }))}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 active:scale-90"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Total Spent</p>
                <p className="mt-2 text-xl font-semibold text-slate-800">
                  {peso(memberValue(purchaseHistory.member, ["Total spent", "total_spent"], 0))}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] uppercase tracking-widest text-slate-500">First Visit</p>
                <p className="mt-2 text-lg font-semibold text-slate-800">
                  {displayDateTime(memberValue(purchaseHistory.member, ["First visit", "first_visit"]))}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Last Visit</p>
                <p className="mt-2 text-lg font-semibold text-slate-800">
                  {displayDateTime(memberValue(purchaseHistory.member, ["Last visit", "last_visit"]))}
                </p>
              </div>
            </div>

            {purchaseHistory.error ? (
              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                {purchaseHistory.error}
              </div>
            ) : null}

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">Transactions</p>
                <p className="text-xs text-slate-500">{purchaseHistory.rows.length} record(s)</p>
              </div>

              {purchaseHistory.loading ? (
                <div className="p-8 text-center text-sm text-slate-500">Loading purchase history...</div>
              ) : purchaseHistory.rows.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">No matching purchase records found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-white text-[10px] uppercase tracking-widest text-slate-500">
                      <tr>
                        <th className="border-b border-slate-200 px-4 py-3">Date</th>
                        <th className="border-b border-slate-200 px-4 py-3">Receipt</th>
                        <th className="border-b border-slate-200 px-4 py-3">Source</th>
                        <th className="border-b border-slate-200 px-4 py-3">Store / Type</th>
                        <th className="border-b border-slate-200 px-4 py-3">Payment</th>
                        <th className="border-b border-slate-200 px-4 py-3 text-right">Total</th>
                        <th className="border-b border-slate-200 px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {purchaseHistory.rows.map((row) => (
                        <tr key={row.id} className="text-slate-700">
                          <td className="px-4 py-3">{displayDateTime(row.date)}</td>
                          <td className="px-4 py-3 font-mono text-xs">{row.receipt || "—"}</td>
                          <td className="px-4 py-3">{row.source}</td>
                          <td className="px-4 py-3">{row.store || "—"}</td>
                          <td className="px-4 py-3">{row.payment || "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-800">{peso(row.total)}</td>
                          <td className="px-4 py-3">{row.status || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VOUCHERS MODAL */}
      {voucherView.open && voucherView.member && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setVoucherView((prev) => ({ ...prev, open: false }))}
        >
          <div
            className="bg-white w-full max-w-4xl rounded-t-[24px] md:rounded-[28px] p-5 md:p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start gap-4 mb-5">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">
                  {voucherStatusLabel(voucherView.status)} Vouchers
                </p>
                <h3 className="text-xl md:text-2xl font-semibold text-slate-800">
                  {voucherView.member.customer_name || voucherView.member["customer_name"] || "Customer"}
                </h3>
                <p className="font-mono text-[10px] text-slate-500 mt-1">
                  {voucherView.member.customer_code || voucherView.member["customer_code"] || voucherView.member.id}
                </p>
              </div>
              <button
                onClick={() => setVoucherView((prev) => ({ ...prev, open: false }))}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 active:scale-90"
                aria-label="Close"
              >
                x
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {["available", "expired", "redeemed"].map((status) => (
                <button
                  key={status}
                  onClick={() => openVoucherList(voucherView.member, status)}
                  className={`px-3 py-2 rounded-xl border text-xs active:scale-95 ${
                    voucherView.status === status
                      ? "bg-[#5b7288] border-[#5b7288] text-white"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {voucherStatusLabel(status)}
                </button>
              ))}
            </div>

            {voucherView.error ? (
              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                {voucherView.error}
              </div>
            ) : null}

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">
                  Voucher Ledger
                </p>
                <p className="text-xs text-slate-500">{voucherView.rows.length} record(s)</p>
              </div>

              {voucherView.loading ? (
                <div className="p-8 text-center text-sm text-slate-500">Loading vouchers...</div>
              ) : voucherView.rows.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No {voucherStatusLabel(voucherView.status).toLowerCase()} vouchers found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-white text-[10px] uppercase tracking-widest text-slate-500">
                      <tr>
                        <th className="border-b border-slate-200 px-4 py-3">Code</th>
                        <th className="border-b border-slate-200 px-4 py-3">Reward</th>
                        <th className="border-b border-slate-200 px-4 py-3">Type</th>
                        <th className="border-b border-slate-200 px-4 py-3">Issued</th>
                        <th className="border-b border-slate-200 px-4 py-3">Expires</th>
                        <th className="border-b border-slate-200 px-4 py-3">Redeemed</th>
                        <th className="border-b border-slate-200 px-4 py-3">Status</th>
                        <th className="border-b border-slate-200 px-4 py-3">Change Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {voucherView.rows.map((voucher) => (
                        <tr key={voucher.id} className="text-slate-700">
                          <td className="px-4 py-3 font-mono text-xs">{voucher.code || voucher.id}</td>
                          <td className="px-4 py-3 min-w-[260px]">{voucher.reward_text || "Voucher"}</td>
                          <td className="px-4 py-3 capitalize">{voucher.reward_type || "standard"}</td>
                          <td className="px-4 py-3">{displayDate(voucher.issued_at)}</td>
                          <td className="px-4 py-3">{displayDate(voucher.expires_at)}</td>
                          <td className="px-4 py-3">{displayDateTime(voucher.redeemed_at)}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] uppercase tracking-widest text-slate-600">
                              {voucherStatusLabel(getVoucherStatus(voucher))}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={getVoucherStatus(voucher)}
                              disabled={voucherStatusBusyId === voucher.id}
                              onChange={(event) => updateVoucherStatus(voucher, event.target.value)}
                              className="h-10 min-w-[140px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <option value="available">Available</option>
                              <option value="redeemed">Redeemed</option>
                              <option value="expired">Expired</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Confirmation</p>
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
                    ? "bg-slate-600 hover:bg-sky-500"
                    : "bg-red-500 hover:bg-red-600"
                }`}
              >
                {actionBusy ? "Working..." : confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
