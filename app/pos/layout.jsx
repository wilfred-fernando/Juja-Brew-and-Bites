import "@/app/style.css";

export const metadata = { title: "Juja POS" };

export default function POSLayout({ children }) {
  // REMOVED <html> and <body> tags to prevent nesting errors.
  // We use a div wrapper to apply the specific POS background color.
  return (
    <div className="antialiased bg-slate-50 min-h-screen w-full">
      {children}
    </div>
  );
}