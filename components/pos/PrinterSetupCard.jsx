"use client";
import { STICKER_SIZES } from '@/lib/printerLabelSize.mjs';

export default function PrinterSetupCard({ role, label, form, saved, onUpdate, onModelChange, onChoose, onReconnect, onTest, onReset, onDelete, onUuidDefaults }) {
  const cup = role === 'cup_label';
  const clabel = /clabel|ct221b/i.test(form.model || '');
  const supported = clabel || /niimbot|b1/i.test(form.model || '');
  const models = cup ? ['Niimbot B1 Pro label printer', 'Clabel CT221B label printer'] : ['Other model', 'ESC/POS compatible', 'Xprinter thermal printer', 'XP-Z58C thermal label printer'];
  if (!models.includes(form.model)) models.unshift(form.model);
  const field = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900';
  const button = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800';
  return <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="text-lg font-bold text-slate-900">{label}</h3><p className="text-sm text-slate-600">{cup ? 'Drink stickers' : role === 'receipt' ? 'Bills and receipts' : 'Kitchen order slips'}</p></div>
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-800"><input type="checkbox" aria-label={`${label} enabled`} checked={!!form.enabled} onChange={e => onUpdate({ enabled: e.target.checked })} className="h-5 w-5" />On</label>
    </div>
    <p className="break-words text-base font-semibold text-slate-800">{form.name || 'No printer selected'}<span className="mt-1 block text-sm font-normal text-slate-600">{saved?.id ? 'Saved' : 'Not saved'} · {form.device_id ? 'Device selected' : 'Choose a Bluetooth printer'}</span></p>
    <label className="block space-y-1 text-sm font-semibold text-slate-700"><span>Printer model</span><select value={form.model} onChange={e => onModelChange(e.target.value)} className={field}>{models.map(model => <option key={model}>{model}</option>)}</select></label>
    <label className="block space-y-1 text-sm font-semibold text-slate-700"><span>{cup ? 'Sticker size (width × height)' : 'Paper width'}</span>
      {cup ? <select value={form.label_size} disabled={!supported} onChange={e => onUpdate({ label_size: e.target.value })} className={field}>{STICKER_SIZES.filter(size => clabel || size.width <= 50).map(size => <option key={size.key} value={size.key}>{size.width} × {size.height} mm</option>)}</select>
        : <select value={form.paper_width_mm} onChange={e => onUpdate({ paper_width_mm: Number(e.target.value) })} className={field}>{[50,58,80].map(width => <option key={width} value={width}>{width} mm</option>)}</select>}
    </label>
    {cup && <p className="text-sm text-slate-600">Size is saved on this device. Match the sticker roll loaded in the printer.{!supported && ' Select Niimbot or Clabel for sticker sizing.'}</p>}
    <div className="grid grid-cols-2 gap-2"><button type="button" onClick={onChoose} className={button}>Choose printer</button><button type="button" onClick={onTest} className={button}>Test print</button></div>
    <button type="button" onClick={onReconnect} className={`${button} w-full`}>Reconnect saved printer</button>
    <details className="rounded-lg border border-slate-200 bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">Advanced settings</summary>
      <div className="mt-3 space-y-3">
        <label className="block space-y-1 text-sm text-slate-700"><span>Printer name</span><input value={form.name} onChange={e => onUpdate({ name: e.target.value })} className={field} /></label>
        <p className="break-all text-xs text-slate-600">Bluetooth device ID: {form.device_id || 'Not selected'}</p>
        <label className="block space-y-1 text-sm text-slate-700"><span>Service UUID</span><input value={form.service_uuid} onChange={e => onUpdate({ service_uuid: e.target.value })} className={field} /></label>
        <label className="block space-y-1 text-sm text-slate-700"><span>Characteristic UUID</span><input value={form.characteristic_uuid} onChange={e => onUpdate({ characteristic_uuid: e.target.value })} className={field} /></label>
        <button type="button" onClick={onUuidDefaults} className={button}>Restore UUID defaults</button>
        <p className="text-sm text-slate-600">Pair the printer in device Bluetooth settings, then choose it here. If reconnect fails, choose the printer again.</p>
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={onReset} className={button}>Reset settings</button><button type="button" onClick={onDelete} className={`${button} text-red-700`}>Delete printer</button></div>
      </div>
    </details>
  </section>;
}
