"use client";

import { useState } from "react";
import { Plus, GripVertical, Star, MoreVertical } from "lucide-react";

export default function POSAdminPage() {
  const [options, setOptions] = useState([
    { id: 1, name: "TAKEOUT", available: true, isDefault: true },
    { id: 2, name: "GRAB | PANDA", available: true, isDefault: false },
    { id: 3, name: "TABLE 1", available: true, isDefault: false },
    { id: 4, name: "TABLE 2", available: true, isDefault: false },
    { id: 5, name: "TABLE 3", available: true, isDefault: false },
    { id: 6, name: "TABLE 4", available: true, isDefault: false },
    { id: 7, name: "TABLE 5", available: true, isDefault: false },
    { id: 8, name: "TABLE 6", available: true, isDefault: false },
    { id: 9, name: "TABLE 7", available: true, isDefault: false },
    { id: 10, name: "TABLE 8", available: true, isDefault: false },
  ]);

  const toggleAvailability = (id) => {
    setOptions(options.map(opt => 
      opt.id === id ? { ...opt, available: !opt.available } : opt
    ));
  };

  const setAsDefault = (id) => {
    setOptions(options.map(opt => ({
      ...opt,
      isDefault: opt.id === id
    })));
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">POS Settings</h1>
          <p className="text-sm text-slate-500 mt-1">Manage order types and dining options</p>
        </div>
        
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <select className="bg-white border border-slate-200 text-slate-700 text-sm rounded-xl px-4 py-2.5 outline-none focus:border-rose-300 w-full sm:w-auto cursor-pointer">
            <option>Juja BnB - Visayas Ave</option>
            <option>All Stores</option>
          </select>
          <button className="flex items-center justify-center gap-2 bg-[#FC687D] hover:bg-[#e85a6e] text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm whitespace-nowrap">
            <Plus size={18} />
            Add Option
          </button>
        </div>
      </div>

      {/* List Container */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="hidden sm:grid grid-cols-12 gap-4 p-4 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          <div className="col-span-6 pl-8">Option Name</div>
          <div className="col-span-3 text-center">Status</div>
          <div className="col-span-3 text-right pr-4">Actions</div>
        </div>

        <div className="divide-y divide-slate-100">
          {options.map((option) => (
            <div 
              key={option.id} 
              className={`group grid grid-cols-1 sm:grid-cols-12 gap-4 p-4 items-center transition-colors hover:bg-slate-50/50 ${
                !option.available ? 'opacity-60 grayscale-[0.5]' : ''
              }`}
            >
              {/* Drag Handle & Name */}
              <div className="col-span-6 flex items-center gap-3">
                <button className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing">
                  <GripVertical size={18} />
                </button>
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-700">{option.name}</span>
                  {option.isDefault && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-[#FC687D] uppercase tracking-wider mt-0.5">
                      <Star size={10} className="fill-[#FC687D]" /> Default
                    </span>
                  )}
                </div>
              </div>

              {/* Availability Toggle */}
              <div className="col-span-3 flex justify-start sm:justify-center items-center pl-8 sm:pl-0">
                <button 
                  onClick={() => toggleAvailability(option.id)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    option.available ? 'bg-[#FC687D]' : 'bg-slate-200'
                  }`}
                >
                  <span 
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      option.available ? 'translate-x-6' : 'translate-x-1'
                    }`} 
                  />
                </button>
                <span className="ml-3 text-xs font-medium text-slate-500 sm:hidden">
                  {option.available ? 'Active' : 'Disabled'}
                </span>
              </div>

              {/* Actions */}
              <div className="col-span-3 flex justify-end items-center gap-2">
                {!option.isDefault && option.available && (
                  <button 
                    onClick={() => setAsDefault(option.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium text-slate-400 hover:text-[#FC687D] px-3 py-1.5 rounded-lg hover:bg-rose-50 hidden sm:block"
                  >
                    Make Default
                  </button>
                )}
                <button className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                  <MoreVertical size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}