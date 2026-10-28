"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { createIncomingRingtone } from '@/lib/posIncomingRingtone';
import { bookingReminderCandidates, claimBookingReminder, acknowledgeBookingReminder, releaseBookingReminder } from '@/lib/bookings/reminders.mjs';

const supabase = getSupabaseClient();
const dateTime = value => new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(new Date(value));

export default function BookingReminders({ storeId, enabled }) {
  const [reminder, setReminder] = useState(null);
  const controls = useRef(null);
  const acknowledgeButton = useRef(null);
  const titleId = useId();
  const audioRef = useRef(null);
  const audibleReminderKey = enabled && reminder?.reminderStoreId === String(storeId) ? reminder.key : null;

  useEffect(() => {
    setReminder(null);
    if (!enabled || !storeId) return;
    let disposed = false, fetching = false, checking = false, bookings = [], fetchedAt = 0, active = null;
    const owner = crypto.randomUUID();
    const scope = `juja:booking-reminders:v1:${storeId}`;
    // Fall back to this session if browser storage is unavailable.
    const memory = new Map();
    let storageUnavailable = false;
    const storage = {
      getItem(key) {
        if (!storageUnavailable) { try { return window.localStorage.getItem(key); } catch { storageUnavailable = true; } }
        return memory.get(key) || null;
      },
      setItem(key, value) {
        memory.set(key, value);
        if (!storageUnavailable) { try { window.localStorage.setItem(key, value); } catch { storageUnavailable = true; } }
      },
    };
    const setActive = next => { active = next; if (!disposed) setReminder(next ? { ...next, reminderStoreId: String(storeId) } : null); };
    const release = () => {
      if (active) releaseBookingReminder(storage, scope, active.key, owner);
      setActive(null);
    };
    const check = async () => {
      if (disposed || checking) return;
      checking = true;
      const run = () => {
        if (disposed) return;
        const now = Date.now();
        // Do not alert from a stale schedule if a cancellation/reschedule cannot
        // be verified. Refresh again when connectivity or focus returns.
        const candidates = now - fetchedAt <= 90000 ? bookingReminderCandidates(bookings, now) : [];
        if (active) {
          const current = candidates.find(row => row.key === active.key);
          if (current && claimBookingReminder(storage, scope, current, owner, now)) { setActive(current); return; }
          release();
        }
        const next = candidates.find(row => claimBookingReminder(storage, scope, row, owner, now));
        if (next) setActive(next);
      };
      try {
        if (navigator.locks?.request) await navigator.locks.request(scope, run);
        else run();
      } finally { checking = false; }
    };
    const refresh = async () => {
      if (disposed || fetching) return;
      fetching = true;
      try {
        const { data, error } = await supabase.rpc('list_pos_booking_reminders', { p_store_id: String(storeId) });
        if (!disposed && !error && Array.isArray(data)) { bookings = data; fetchedAt = Date.now(); }
      } catch { /* Timed retry and focus/online events refresh the schedule. */ }
      finally { fetching = false; if (!disposed) void check(); }
    };
    const acknowledge = () => {
      if (!active) return;
      acknowledgeBookingReminder(storage, scope, active);
      setActive(null);
      void check();
    };
    controls.current = { acknowledge };
    const onStorage = event => { if (event.key === scope) void check(); };
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(() => void check(), 15000);
    const polling = window.setInterval(() => void refresh(), 60000);
    const channel = supabase.channel(`booking-reminders:${storeId}:${owner}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'function_room_bookings' }, () => void refresh()).subscribe();
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    void refresh();
    return () => {
      disposed = true;
      release();
      controls.current = null;
      window.clearInterval(timer);
      window.clearInterval(polling);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [storeId, enabled]);

  useEffect(() => {
    if (!audibleReminderKey) return;
    const previousFocus = document.activeElement;
    acknowledgeButton.current?.focus();
    const audio = new Audio('/sound/notification.mp3');
    audioRef.current = audio;
    const ringtone = createIncomingRingtone(audio, window);
    ringtone.start();
    return () => {
      ringtone.stop();
      audioRef.current = null;
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, [audibleReminderKey]);

  if (!enabled || !reminder || reminder.reminderStoreId !== String(storeId)) return null;
  return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4">
    <section role="alertdialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const buttons = event.currentTarget.querySelectorAll('button');
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }} className="w-full max-w-md rounded-2xl border border-amber-300 bg-[#fffaf0] p-6 text-slate-900 shadow-2xl">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-800">{reminder.hours}-hour booking reminder</p>
      <h2 id={titleId} className="mt-2 text-xl font-bold">Upcoming function-room booking</h2>
      <p className="mt-4 text-lg font-bold">{reminder.customer_name}</p>
      <p className="mt-1 font-semibold">Starts {dateTime(reminder.start_at)} (Philippine time)</p>
      <p className="mt-2 text-sm">Package {reminder.package_id} · {reminder.guest_count} guests{reminder.event_type ? ` · ${reminder.event_type}` : ''}</p>
      <p className="mt-1 text-xs text-slate-600">{reminder.reference_code}</p>
      <div className="mt-6 flex gap-2">
        <button type="button" onClick={() => void audioRef.current?.play().catch(() => {})} className="rounded-lg border border-slate-400 bg-white px-4 py-3 text-sm font-semibold">Play sound</button>
        <button ref={acknowledgeButton} type="button" onClick={() => controls.current?.acknowledge()} className="flex-1 rounded-lg bg-slate-900 px-4 py-3 font-bold text-white">Acknowledge</button>
      </div>
    </section>
  </div>;
}
