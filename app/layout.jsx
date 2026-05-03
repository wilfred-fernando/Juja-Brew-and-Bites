import "./globals.css";

export const metadata = {
  title: "Juja 주자 Brew & Bites",
  description: "Your premier destination for specialty brews and artisan bites in Quezon City.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Load the Inter font to match your design specs */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased bg-[#FFF5F7] text-slate-800" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        {/* 
          Notice there is no Sidebar or Navbar here! 
          The Root Layout just wraps the app. 
          The Admin Sidebar is handled in app/admin/layout.jsx 
          and the public Nav is in the individual public pages. 
        */}
        {children}
      </body>
    </html>
  );
}