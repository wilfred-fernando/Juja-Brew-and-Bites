"use client";

export default function AvailabilityCategoryNav({ groups, selected, onSelect, label = 'Menu categories', allLabel = 'All categories' }) {
  const entries = [{ key: null, label: allLabel, count: groups.reduce((sum, group) => sum + group.count, 0) }, ...groups];
  return <nav aria-label={label} className="pos-availability-categories">
    {entries.map(group => <button key={group.key ?? '__all__'} type="button"
      aria-pressed={selected === group.key} onClick={() => onSelect(group.key)}
      className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-base font-semibold ${selected === group.key ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-800'}`}>
      <span className="min-w-0 break-words">{group.label}</span>
      <span className="shrink-0 text-sm tabular-nums">{group.count}</span>
    </button>)}
  </nav>;
}
