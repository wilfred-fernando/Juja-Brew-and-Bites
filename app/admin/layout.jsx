// app/admin/layout.jsx
import Link from "next/link";

export default function AdminLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-[#F9F7F2]">
      
      {/* Admin Sidebar */}
      <aside className="w-64 bg-[#1A1A1A] text-white flex flex-col">
        <div className="p-6 text-xl font-bold border-b border-gray-800">
          JUJA <span className="text-[#1EBBA3]">MERCHANT</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 uppercase tracking-wider text-sm font-semibold">
          <Link href="/admin" className="block py-3 px-4 hover:bg-gray-800 transition-colors">Home</Link>
          <Link href="/admin/stores" className="block py-3 px-4 hover:bg-gray-800 transition-colors">Stores</Link>
          <Link href="/admin/menu" className="block py-3 px-4 hover:bg-gray-800 transition-colors">Menu Builder</Link>
          <Link href="/admin/promos" className="block py-3 px-4 hover:bg-gray-800 transition-colors">Promo Codes</Link>
          <Link href="/admin/orders" className="block py-3 px-4 hover:bg-gray-800 transition-colors">Live Orders</Link>
          <Link href="/admin/settings" className="block py-3 px-4 hover:bg-gray-800 transition-colors">Settings</Link>
          <Link href="/admin/account" className="block py-3 px-4 hover:bg-gray-800 transition-colors">My Account</Link>
        </nav>
      </aside>

      {/* Admin Page Content */}
      <main className="flex-1 p-8">
        {children}
      </main>
      
    </div>
  );
}
import { Space_Mono } from 'next/font/google';

const spaceMono = Space_Mono({ 
  subsets: ['latin'], 
  weight: ['400', '700'],
  variable: '--font-space-mono' 
});

export default function AdminLayout({ children }) {
  return (
    <div className={`${spaceMono.variable} font-mono flex min-h-screen bg-[#F9F7F2]`}>
      {/* ... rest of your sidebar code ... */}
    </div>
  );
}