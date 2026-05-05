"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { name: 'Home', path: '/admin', icon: '🏠' },
  { name: 'POS', path: '/admin/pos', icon: '🖥️' }, // Added POS for quick access
  { name: 'Menu', path: '/admin/menu', icon: '📋' },
  { name: 'Orders', path: '/admin/orders', icon: '📦' },
  { name: "Loyalty", icon: "⭐", path: "/admin/loyalty" },
  { name: 'Analytics', path: '/admin/analytics', icon: '📈' },
  { name: 'Settings', path: '/admin/settings', icon: '⚙️' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    /* 
       Updated width: w-[220px] on tablets, w-64 on desktop. 
       Added 'max-h-screen' and 'flex-col' to ensure it never overflows.
    */
    <aside className="w-[200px] xl:w-64 bg-white border-r border-gray-100 flex flex-col sticky top-0 h-screen overflow-hidden">
      
      {/* Branding Area */}
      <div className="p-5 xl:p-6 border-b border-gray-50 flex items-center gap-3 flex-shrink-0">
        <div className="w-7 h-7 xl:w-8 xl:h-8 bg-[#FC687D] rounded-md shadow-sm"></div>
        <span className="font-normal text-[10px] xl:text-xs tracking-tighter text-[#111827] uppercase">
          Merchant Panel
        </span>
      </div>

      {/* 
          Main Navigation: 
          - Using 'flex-1' to take up all middle space.
          - Using 'flex-col' and 'justify-between' for auto-fitting.
      */}
      <nav className="flex-1 overflow-y-auto p-3 xl:p-4 flex flex-col gap-1 xl:gap-2 hide-scrollbar">
        {navItems.map((item) => (
          <Link
            key={item.name}
            href={item.path}
            /* 
               The secret to autofit:
               - We use 'flex-1' so they grow to fill space on tablets.
               - Added 'min-h-[40px]' and 'max-h-[55px]' to keep them elegant.
            */
            className={`flex-1 min-h-[40px] max-h-[50px] xl:max-h-[55px] flex items-center gap-3 xl:gap-4 px-4 rounded-xl text-[10px] xl:text-[11px] font-normal uppercase tracking-widest transition-all active:scale-95 ${
              pathname === item.path 
              ? 'bg-[#FFF5F7] text-[#FC687D] font-bold shadow-sm' 
              : 'text-gray-400 hover:bg-gray-50'
            }`}
          >
            <span className="text-base xl:text-lg opacity-80">{item.icon}</span>
            <span className="truncate">{item.name}</span>
          </Link>
        ))}
      </nav>

      {/* Footer / Sign Out */}
      <div className="p-4 xl:p-6 border-t border-gray-50 flex-shrink-0 bg-white">
        <button className="w-full text-left text-[9px] xl:text-[10px] font-normal text-red-400 uppercase tracking-widest hover:text-red-600 transition-colors py-2 active:scale-95">
          Sign Out
        </button>
      </div>
    </aside>
  )
}