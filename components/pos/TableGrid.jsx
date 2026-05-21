export default function TableGrid({ tables, orderType, setOrderType }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {tables.map(t => (
        <button
          key={t.id}
          onClick={() => setOrderType(t.name)}
          className={`p-3 rounded-xl font-bold
            ${orderType === t.name
              ? "bg-pink-500 text-white"
              : t.table_status === "occupied"
                ? "bg-red-200"
                : "bg-green-200"
            }
          `}
        >
          {t.name}
        </button>
      ))}
    </div>
  );
}