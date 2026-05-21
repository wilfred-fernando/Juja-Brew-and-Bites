export default function PrinterModal({ open, onClose, printers }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white p-6 rounded-xl w-[400px] space-y-4">
        <h2 className="font-bold">Printers</h2>

        {Object.entries(printers || {}).map(([role, p]) => (
          <div key={role} className="border p-3 rounded">
            <div className="font-bold">{role}</div>
            <div className="text-xs text-slate-500">
              {p?.transport || "browser"}
            </div>
          </div>
        ))}

        <button onClick={onClose} className="w-full bg-black text-white py-2 rounded">
          Close
        </button>
      </div>
    </div>
  );
}