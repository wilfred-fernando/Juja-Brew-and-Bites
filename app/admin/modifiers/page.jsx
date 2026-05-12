"use client";
import { useState, useEffect } from "react";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";

export default function ModifiersAdmin() {
  const supabase = createBrowserClient();
  const [groups, setGroups] = useState([]);

  useEffect(() => { fetchGroups(); }, []);

  async function fetchGroups() {
    const { data } = await supabase
      .from('modifier_groups')
      .select('*, modifier_options(*)');
    if (data) setGroups(data);
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Modifiers</h1>
        <button className="bg-[#FC687D] text-white px-4 py-2 rounded-xl flex items-center gap-2">
          <Plus size={18}/> Add Modifier Group
        </button>
      </div>

      <div className="space-y-4">
        {groups.map(group => (
          <div key={group.id} className="bg-white border border-slate-100 p-5 rounded-2xl flex justify-between items-center hover:shadow-md transition-all">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-rose-50 rounded-xl text-[#FC687D]"><Settings2 size={20}/></div>
              <div>
                <h3 className="font-bold text-slate-800">{group.name}</h3>
                <p className="text-xs text-slate-400">
                  {group.modifier_options?.map(o => o.name).join(", ")}
                </p>
              </div>
            </div>
            <button className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={18}/></button>
          </div>
        ))}
      </div>
    </div>
  );
}