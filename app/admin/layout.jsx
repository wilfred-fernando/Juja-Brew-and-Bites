import { Space_Mono } from 'next/font/google';
import Link from "next/link";

// 1. Initialize the unique font
const spaceMono = Space_Mono({ 
  subsets: ['latin'], 
  weight: ['400', '700'],
  variable: '--font-space-mono' 
});

// 2. ONLY ONE AdminLayout definition allowed
export default function AdminLayout({ children }) {
  return (
    <div className={`${spaceMono.variable} font-mono flex min-h-screen bg-[#F9F7F2] text-[#1A1A1A]`}>
      
      {/* Side Navigation */}
      <aside className="w-64 bg-[#1A1A1A] text-white flex flex-col shrink-0">
        <div className="p-8 border-b border-gray-800">
          <p className="text-2xl font-bold tracking-tighter uppercase">
            JUJA <span className="text-[#1EBBA3]">MKT</span>
          </p>
          <p className="text-[10px] text-gray-500 font-bold tracking-[0.3em] mt-1">DASHBOARD</p>
        </div>
        
        <nav className="flex-1 p-6 space-y-1">
          <Link href="/admin" className="block py-3 px-4 text-xs font-bold uppercase tracking-widest hover:text-[#1EBBA3] transition-colors">Home</Link>
          <Link href="/admin/stores" className="block py-3 px-4 text-xs font-bold uppercase tracking-widest hover:text-[#1EBBA3] transition-colors">Stores</Link>
          <Link href="/admin/menu" className="block py-3 px-4 text-xs font-bold uppercase tracking-widest text-[#1EBBA3] border-l-2 border-[#1EBBA3]">Menu Builder</Link>
          <Link href="/admin/promos" className="block py-3 px-4 text-xs font-bold uppercase tracking-widest hover:text-[#1EBBA3] transition-colors">Promo Codes</Link>
          <Link href="/admin/orders" className="block py-3 px-4 text-xs font-bold uppercase tracking-widest hover:text-[#1EBBA3] transition-colors">Live Orders</Link>
          <Link href="/admin/settings" className="block py-3 px-4 text-xs font-bold uppercase tracking-widest hover:text-[#1EBBA3] transition-colors">Settings</Link>
        </nav>

        <div className="p-6 border-t border-gray-800">
          <Link href="/admin/account" className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-white">Account v1.0.4</Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-10 overflow-y-auto">
        {children}
      </main>
      
    </div>
  );
}