"use client";

import { useId, useState } from 'react';

export default function BookingReservationSelector({ bookings, selectedId, onSelect, onRefresh, onCollect, busy, error, selectionLocked = false }) {
  const [method, setMethod] = useState('Cash');
  const selectId = useId();
  const booking = bookings.find(row => row.id === selectedId);
  return <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={selectId} className="font-semibold">Confirmed booking</label>
      <button type="button" disabled={busy} onClick={onRefresh} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-slate-800">Refresh</button>
    </div>
    <select id={selectId} value={selectedId || ''} disabled={busy || selectionLocked} onChange={event => onSelect(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-800">
      <option value="">Select a confirmed booking</option>
      {bookings.map(row => <option key={row.id} value={row.id}>{row.customer_name} · {row.business_date} · {new Date(row.start_at).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })} · Package {row.package_id}</option>)}
    </select>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {booking?.voucher ? <div className="space-y-1">
      <p className="font-semibold">Reservation credit: ₱{Number(booking.voucher.amount).toFixed(2)}</p>
      <p className="break-all text-[10px]">{booking.voucher.code}</p>
      <p>Applied once to this booking’s final bill.</p>
    </div> : booking && Number(booking.deposit_amount) > 0 && booking.payment_method !== 'Waived' ? <div className="space-y-2">
      <p>Reservation fee: ₱{Number(booking.deposit_amount).toFixed(2)}</p>
      <p>Record only money received or verified in this shift. Previously recorded fees must not be collected again.</p>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Reservation fee payment method" value={method} onChange={event => setMethod(event.target.value)} disabled={busy} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-800">
          {['Cash','Card','QRPH'].map(value => <option key={value}>{value}</option>)}
        </select>
        <button type="button" disabled={busy} onClick={() => onCollect(booking.id, method)} className="rounded-lg bg-slate-800 px-3 py-2 font-semibold text-white">{busy ? 'Recording…' : 'Record fee & issue voucher'}</button>
      </div>
    </div> : booking ? <p>No reservation fee credit for this booking.</p> : <p>Select the booking before saving or charging its final bill.</p>}
  </div>;
}
