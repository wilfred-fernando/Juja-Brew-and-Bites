"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── DRAGGABLE ROW COMPONENT ───
function SortableRow({ opt, onToggle, onSetDefault, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: opt.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : "auto",
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className={`group hover:bg-slate-50/50 transition-all ${isDragging ? 'bg-white shadow-2xl' : ''}`}>
      {/* DRAG HANDLE */}
      <td className="px-6 py-6 w-10">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-200 hover:text-[#FC687D] transition-colors">
          <span className="text-lg">≡</span>
        </button>
      </td>
      <td className="px-8 py-6">
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-700 text-sm tracking-tight">{opt.name}</span>
          {opt.is_default && <span className="px-2 py-0.5 bg-rose-50 text-[#FC687D] text-[8px] font-black rounded-full uppercase tracking-tighter">Default</span>}
        </div>
      </td>
      <td className="px-8 py-6 text-center">
        <button onClick={() => onSetDefault(opt.id)} disabled={opt.is_default} className={`text-xl transition-all ${opt.is_default ? 'text-amber-400' : 'text-slate-200 hover:text-slate-400'}`}>
          {opt.is_default ? '★' : '☆'}
        </button>
      </td>
      <td className="px-8 py-6">
        <button onClick={() => onToggle(opt.id, opt.is_available)} className={`w-10 h-5 rounded-full relative transition-all ${opt.is_available ? 'bg-[#FC687D]' : 'bg-slate-200'}`}>
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${opt.is_available ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </td>
      <td className="px-8 py-6 text-right">
        <button onClick={() => onDelete(opt.id)} className="text-[10px] font-black text-slate-300 hover:text-red-500 uppercase tracking-widest transition-colors opacity-0 group-hover:opacity-100">Delete</button>
      </td>
    </tr>
  );
}

// ─── MAIN ADMIN PAGE ───
export default function DiningOptionsAdmin() {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newOption, setNewOption] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const { data } = await supabase.from("dining_options").select("*").order("sort_order", { ascending: true });
    if (data) setOptions(data);
    setLoading(false);
  }

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setOptions((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const newArray = arrayMove(items, oldIndex, newIndex);
        
        // Silently update database order
        updateDatabaseOrder(newArray);
        return newArray;
      });
    }
  };

  async function updateDatabaseOrder(newArray) {
    const updates = newArray.map((item, index) => ({
      id: item.id,
      sort_order: index,
      name: item.name // Supabase UPSERT usually requires non-null fields
    }));
    await supabase.from("dining_options").upsert(updates);
  }

  async function addOption() {
    if (!newOption) return;
    await supabase.from("dining_options").insert([{ 
      name: newOption.toUpperCase(), 
      is_available: true, 
      sort_order: options.length 
    }]);
    setNewOption("");
    fetchData();
  }

  async function setDefault(id) {
    await supabase.from("dining_options").update({ is_default: false }).not("id", "eq", id);
    await supabase.from("dining_options").update({ is_default: true }).eq("id", id);
    fetchData();
  }

  if (loading) return <div className="p-20 text-center font-black uppercase text-slate-200 tracking-widest">Sorting Hub...</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto bg-[#FDFDFD] min-h-screen">
      <header className="mb-12 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Dining Options</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#FC687D] mt-2">Drag to Reorder List</p>
        </div>
        <div className="flex gap-2">
          <input value={newOption} onChange={(e) => setNewOption(e.target.value)} placeholder="NEW OPTION" className="px-4 py-3 bg-white border border-slate-100 rounded-xl text-xs font-bold outline-none" />
          <button onClick={addOption} className="px-6 py-3 bg-[#FC687D] text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-rose-100">Add</button>
        </div>
      </header>

      <div className="bg-white rounded-[32px] border border-slate-50 shadow-[0_20px_50px_rgba(0,0,0,0.02)] overflow-hidden">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <table className="w-full text-left">
            <thead className="bg-slate-50/50">
              <tr>
                <th className="px-6 py-5"></th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Name</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Default</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                <th className="px-8 py-5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <SortableContext items={options.map(i => i.id)} strategy={verticalListSortingStrategy}>
                {options.map((opt) => (
                  <SortableRow 
                    key={opt.id} 
                    opt={opt} 
                    onSetDefault={setDefault} 
                    onToggle={async (id, status) => { await supabase.from("dining_options").update({ is_available: !status }).eq("id", id); fetchData(); }}
                    onDelete={async (id) => { if(confirm("Delete?")) { await supabase.from("dining_options").delete().eq("id", id); fetchData(); }}}
                  />
                ))}
              </SortableContext>
            </tbody>
          </table>
        </DndContext>
      </div>
    </div>
  );
}