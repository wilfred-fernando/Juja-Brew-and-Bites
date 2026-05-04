"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

export default function AdminLoyalty() {
  const [user, setUser] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  // Edit Modal State
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function loadData() {
      // 1. Verify Admin Auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || session.user.user_metadata?.role !== "admin") {
        router.push("/login");
        return;
      }
      setUser(session.user);

      // 2. Fetch all loyalty members using the EXACT CSV column name for sorting
      const { data, error } = await supabase
        .from("loyalty_members")
        .select("*")
        .order("Points balance", { ascending: false }); // Sort by highest points first
        
      if (!error && data) {
        setMembers(data);
      } else if (error) {
        console.error("Supabase Error:", error);
      }
      setLoading(false);
    }
    loadData();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      const { error } = await supabase
        .from("loyalty_members")
        .update({
          "Customer name": editing["Customer name"],
          "Phone": editing["Phone"],
          "Points balance": parseFloat(editing["Points balance"]) || 0,
          "Total visits": parseInt(editing["Total visits"]) || 0,
          "Note": editing["Note"]
        })
        .eq("id", editing.id);

      if (error) throw error;

      // Update the local state instantly
      setMembers(members.map(m => m.id === editing.id ? editing : m));
      setEditing(null);
    } catch (error) {
      alert("Failed to save changes: " + error.message);
    }
    setSaving(false);
  };

  // Filter members based on search bar using the exact CSV column names
  const filteredMembers = members.filter(m => 
    (m["Customer name"]?.toLowerCase().includes(search.toLowerCase())) ||
    (m["Customer code"]?.toLowerCase().includes(search.toLowerCase())) ||
    (m["Email"]?.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7]">
        <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF5F7] pb-20 font-sans text-slate-800">
      
      {/* ── TOP HEADER ── */}
      <header className="bg-white/95 backdrop-blur-md border-b border-rose-50 px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-6">
          <img src={LOGO} alt="Juja" className="h-8 w-auto object-contain" />
          <div className="hidden md:flex items-center gap-1 bg-slate-50 px-1 py-1 rounded-full border border-slate-100">
            <Link href="/admin" className="px-4 py-1.5 rounded-full text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors">Dashboard</Link>
            <span className="px-4 py-1.5 rounded-full text-xs font-bold bg-white text-[#FC687D] shadow-sm">Loyalty</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold uppercase tracking-widest bg-rose-50 text-[#FC687D] px-3 py-1 rounded-full border border-rose-100">Admin</span>
          <button onClick={handleLogout} className="text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:text-rose-500 transition-colors">Sign Out</button>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="max-w-6xl mx-auto px-6 pt-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight mb-1">Loyalty Members</h1>
            <p className="text-slate-500 font-medium text-sm">Manage customer points, visits, and details.</p>
          </div>
          
          {/* Search Bar */}
          <div className="relative w-full md:w-80">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              type="text" 
              placeholder="Search by name or ID..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-rose-100 rounded-full pl-10 pr-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:border-[#FC687D] focus:ring-1 focus:ring-[#FC687D] transition-all shadow-sm"
            />
          </div>
        </div>

        {/* ── STATS CARDS ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-[24px] p-6 border border-rose-50 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Total Members</p>
            <p className="text-3xl font-black text-slate-800">{members.length}</p>
          </div>
          <div className="bg-white rounded-[24px] p-6 border border-rose-50 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Total Points Active</p>
            <p className="text-3xl font-black text-[#FC687D]">
              {members.reduce((acc, curr) => acc + (parseFloat(curr["Points balance"]) || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>

        {/* ── DATA TABLE ── */}
        <div className="bg-white rounded-[32px] border border-rose-50 shadow-[0_8px_30px_rgba(252,104,125,0.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-rose-50 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <th className="p-5 font-bold whitespace-nowrap">Customer Info</th>
                  <th className="p-5 font-bold whitespace-nowrap">Member ID</th>
                  <th className="p-5 font-bold whitespace-nowrap">Points</th>
                  <th className="p-5 font-bold whitespace-nowrap">Visits</th>
                  <th className="p-5 font-bold text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-50/50">
                {filteredMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-[#FFF9FA] transition-colors group">
                    <td className="p-5">
                      <p className="font-extrabold text-slate-800 text-[13px]">{member["Customer name"] || "Unknown"}</p>
                      <p className="text-slate-400 text-[11px] font-medium mt-0.5">{member["Phone"] || member["Email"] || "No contact info"}</p>
                    </td>
                    <td className="p-5">
                      <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">{member["Customer code"] || "—"}</span>
                    </td>
                    <td className="p-5">
                      <span className="font-black text-[#FC687D] text-lg">{parseFloat(member["Points balance"] || 0).toFixed(2)}</span>
                    </td>
                    <td className="p-5">
                      <span className="font-bold text-slate-700">{member["Total visits"] || 0}</span>
                    </td>
                    <td className="p-5 text-right">
                      <button 
                        onClick={() => setEditing({ ...member })}
                        className="text-[10px] font-bold uppercase tracking-widest text-[#FC687D] border border-rose-200 bg-white px-4 py-2 rounded-full hover:bg-[#FC687D] hover:text-white transition-colors shadow-sm"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredMembers.length === 0 && (
                  <tr>
                    <td colSpan="5" className="p-10 text-center text-slate-400 font-medium">
                      No members found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ── EDIT MODAL ── */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div 
            className="w-full max-w-md bg-white rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-extrabold text-slate-800">Edit Member</h3>
                <p className="text-slate-400 text-xs font-mono mt-1">{editing["Customer code"]}</p>
              </div>
              <div className="w-12 h-12 bg-rose-50 text-[#FC687D] rounded-full flex items-center justify-center text-xl">⭐</div>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-1.5 ml-1">Full Name</label>
                <input type="text" value={editing["Customer name"] || ""}
                  onChange={e => setEditing({...editing, "Customer name": e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:border-[#FC687D] transition-all" />
              </div>
              
              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-1.5 ml-1">Phone Number</label>
                <input type="text" value={editing["Phone"] || ""}
                  onChange={e => setEditing({...editing, "Phone": e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:border-[#FC687D] transition-all" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-800 mb-1.5 ml-1">Points Balance</label>
                  <input type="number" step="0.01" value={editing["Points balance"] || 0}
                    onChange={e => setEditing({...editing, "Points balance": e.target.value})}
                    className="w-full bg-white border border-rose-200 text-[#FC687D] font-black rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-1 focus:ring-[#FC687D] transition-all" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-800 mb-1.5 ml-1">Total Visits</label>
                  <input type="number" value={editing["Total visits"] || 0}
                    onChange={e => setEditing({...editing, "Total visits": e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:border-[#FC687D] transition-all" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-1.5 ml-1">Notes (Birthday / Preferences)</label>
                <input type="text" value={editing["Note"] || ""}
                  onChange={e => setEditing({...editing, "Note": e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:border-[#FC687D] transition-all" />
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setEditing(null)}
                  className="flex-1 py-3.5 rounded-full bg-slate-100 text-slate-600 font-bold text-[13px] hover:bg-slate-200 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-3.5 rounded-full font-bold text-[13px] text-white transition-all bg-[#FC687D] hover:bg-rose-500 shadow-[0_4px_15px_rgba(252,104,125,0.3)] disabled:opacity-60">
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