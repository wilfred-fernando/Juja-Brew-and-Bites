"use client";
import { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { getSupabaseClient } from '@/lib/supabase/client';
const NativeWidget = registerPlugin('PosBookingWidget');

export default function PosBookingWidget({ storeId, enabled }) {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('PosBookingWidget')) return;
    const supabase = getSupabaseClient();
    let stopped = false, busy = false, configured = false, generation = 0;
    const sync = async () => {
      if (busy || stopped) return;
      busy = true;
      const started = generation;
      try {
        const { data } = await supabase.auth.getSession();
        if (!enabled || !storeId || !data?.session) { await NativeWidget.clear(); configured = false; return; }
        if (!configured) await NativeWidget.clear();
        const identity = await NativeWidget.identity();
        if (!configured || !identity.connected) {
          const response = await fetch('/api/pos/booking-widget', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
            body: JSON.stringify({ deviceId: identity.deviceId, storeId }) });
          const result = await response.json();
          if (!response.ok || !result.token) return;
          if (stopped || started !== generation) { await fetch('/api/pos/booking-widget', { method: 'DELETE', headers: { Authorization: `Bearer ${result.token}` } }).catch(() => {}); return; }
          await NativeWidget.configure({ token: result.token }); configured = true;
        } else await NativeWidget.refresh();
      } catch { /* Older APKs remain usable; native refresh retries independently. */ }
      finally { busy = false; }
    };
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { generation++; configured = false; void NativeWidget.clear().catch(() => {}); }
      else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') { generation++; configured = false; window.setTimeout(() => void sync(), 0); }
      else window.setTimeout(() => void sync(), 0);
    });
    const channel = enabled && storeId ? supabase.channel(`booking-widget:${storeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'function_room_bookings' }, () => void sync()).subscribe() : null;
    const timer = window.setInterval(() => void sync(), 60000);
    window.addEventListener('focus', sync); void sync();
    return () => { stopped = true; listener.subscription.unsubscribe(); if (channel) void supabase.removeChannel(channel); window.clearInterval(timer); window.removeEventListener('focus', sync); };
  }, [storeId, enabled]);
  return null;
}
