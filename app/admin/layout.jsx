"use client";

export default function AdminLayout({ children }) {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f8fafc" }}>
      <div style={{ background: "yellow", padding: "10px", textAlign: "center", color: "black", fontWeight: "bold" }}>
        ⚠️ SECURITY BYPASS ACTIVE 
      </div>
      {children}
    </div>
  );
}