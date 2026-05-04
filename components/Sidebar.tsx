"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { name: 'Home', path: '/admin', icon: '🏠' },
  { name: 'Stores', path: '/admin/stores', icon: '🛒' },
  { name: 'Menu', path: '/admin/menu', icon: '📋' },
  { name: 'Orders', path: '/admin/orders', icon: '📦' },
  { name: 'Analytics', path: '/admin/analytics', icon: '📈' },
  { name: 'Settings', path: '/admin/settings', icon: '⚙️' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 bg-white border-r border-gray-100 flex flex-col sticky top-0 h-screen">
      <div className="p-6 border-b border-gray-50 flex items-center gap-3">
        <div className="w-8 h-8 bg-[#1EBBA3] rounded-md"></div>
        <span className="font-black text-sm tracking-tighter text-[#111827]">MERCHANT PANAL</span>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.name}
            href={item.path}
            className={`flex items-center gap-4 px-4 py-3 text-[11px] font-black uppercase tracking-widest transition-all ${
              pathname === item.path 
              ? 'bg-[#F0FDF4] text-[#1EBBA3] border-r-4 border-[#1EBBA3]' 
              : 'text-gray-400 hover:bg-gray-50'
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            {item.name}
          </Link>
        ))}
      </nav>

      <div className="p-6 border-t border-gray-50">
        <button className="text-[10px] font-black text-red-400 uppercase tracking-widest hover:text-red-600 transition-colors">
          Logout
        </button>
      </div>
    </aside>
  )
}

{ name: "Loyalty", icon: "⭐", path: "/admin/loyalty" }