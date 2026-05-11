"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const navItems = [
  { name: 'Dashboard', path: '/admin', icon: '🏠' },
  { 
    name: 'Reports', 
    path: '/admin/reports', 
    icon: '📊',
    submenu: [
      { name: 'Sales Summary', path: '/admin/reports/sales' },
      { name: 'Sales by Item', path: '/admin/reports/items' },
      { name: 'Sales by Category', path: '/admin/reports/categories' },
      { name: 'Receipts', path: '/admin/reports/receipts' },
      { name: 'Shifts', path: '/admin/reports/shifts' },
    ]
  },
  { 
    name: 'POS Admin', 
    path: '/pos', 
    icon: '🖥️',
    submenu: [
      { name: 'Terminal Config', path: '/admin/pos/config' },
      { name: 'Dining Options', path: '/admin/pos/dining' },
      { name: 'Payment Types', path: '/admin/pos/payments' },
    ]
  },
  { 
    name: 'Items', 
    path: '/admin/menu', 
    icon: '🛍️',
    submenu: [
      { name: 'Item Library', path: '/admin/menu/items' },
      { name: 'Categories', path: '/admin/menu/categories' },
      { name: 'Modifiers', path: '/admin/menu/modifiers' },
    ]
  },
  { name: 'Loyalty', path: '/admin/loyalty', icon: '⭐' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [openSection, setOpenSection] = useState("");
  if (pathname.includes('/login')) return null;

  // Sync open section with current URL on load
  useEffect(() => {
    const active = navItems.find(item => pathname.startsWith(item.path));
    if (active?.submenu) {
      setOpenSection(active.name);
    }
  }, [pathname]);

  // 👇 ADDED ": string" HERE TO FIX THE TYPESCRIPT ERROR
  const toggleSection = (name: string) => {
    setOpenSection(prev => (prev === name ? "" : name));
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-100 flex flex-col h-screen sticky top-0 z-[100] overflow-hidden">
      
      {/* Branding Area */}
      <div className="p-8 border-b border-gray-50 flex items-center gap-3 flex-shrink-0">
        <div className="w-8 h-8 bg-[#FC687D] rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-rose-100">J</div>
        <span className="font-black text-[10px] tracking-[0.3em] uppercase text-slate-800">Merchant Panel</span>
      </div>

      {/* Navigation Hubs */}
      <nav className="flex-1 overflow-y-auto p-4 flex flex-col gap-1 hide-scrollbar">
        {navItems.map((item) => {
          const hasSub = !!item.submenu;
          const isOpen = openSection === item.name;
          const isActive = pathname === item.path || (hasSub && pathname.startsWith(item.path));

          return (
            <div key={item.name} className="flex flex-col w-full">
              {hasSub ? (
                /* PARENT HUB (Toggle only) */
                <button
                  type="button"
                  onClick={() => toggleSection(item.name)}
                  className={`flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all outline-none ${
                    isActive ? 'bg-[#FFF5F7] text-[#FC687D]' : 'text-slate-400 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-lg opacity-80">{item.icon}</span>
                    <span className="text-[11px] font-black uppercase tracking-widest">{item.name}</span>
                  </div>
                  <span className={`text-[8px] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
                </button>
              ) : (
                /* STANDALONE LINK */
                <Link
                  href={item.path}
                  className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all ${
                    pathname === item.path ? 'bg-[#FFF5F7] text-[#FC687D]' : 'text-slate-400 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-lg opacity-80">{item.icon}</span>
                  <span className="text-[11px] font-black uppercase tracking-widest">{item.name}</span>
                </Link>
              )}

              {/* DRILL-DOWN SUBMENU */}
              {hasSub && isOpen && (
                <div className="mt-1 mb-4 ml-12 border-l border-slate-100 flex flex-col gap-0.5 animate-in slide-in-from-top-2 duration-300">
                  {item.submenu.map((sub) => {
                    const isSubActive = pathname === sub.path;
                    return (
                      <Link
                        key={sub.name}
                        href={sub.path}
                        className={`py-2.5 pl-5 pr-4 text-[10px] font-bold uppercase tracking-[0.15em] transition-all relative group ${
                          isSubActive ? 'text-slate-900 font-black' : 'text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        {/* Luxury Line Indicator */}
                        <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-2 h-[1px] transition-all ${
                          isSubActive ? 'bg-[#FC687D] w-4' : 'bg-gray-200 group-hover:bg-gray-400'
                        }`}></div>
                        {sub.name}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer Area */}
      <div className="p-6 border-t border-slate-50 bg-white">
        <button className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 hover:text-red-400 transition-colors">Sign Out</button>
      </div>
    </aside>
  );
}