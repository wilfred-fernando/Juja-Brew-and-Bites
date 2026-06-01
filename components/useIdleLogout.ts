"use client";

import { useEffect, useRef } from "react";

type IdleLogoutOptions = {
  timeoutMs: number;                 // e.g. 60 * 60 * 1000
  onTimeout: () => Promise<void> | void;
  storageKey?: string;              // default: "juja:lastActivity"
  checkIntervalMs?: number;         // default: 15s
};

export function useIdleLogout({
  timeoutMs,
  onTimeout,
  storageKey = "juja:lastActivity",
  checkIntervalMs = 15000,
}: IdleLogoutOptions) {
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;

    const now = Date.now();
    if (!localStorage.getItem(storageKey)) {
      localStorage.setItem(storageKey, String(now));
    }

    const bump = () => {
      localStorage.setItem(storageKey, String(Date.now()));
    };

    // user activity events
    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    events.forEach((evt) => window.addEventListener(evt, bump, { passive: true }));

    // cross-tab sync: if another tab updates lastActivity, this tab sees it
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey) {
        // nothing needed; interval checker will read the latest value
      }
    };
    window.addEventListener("storage", onStorage);

    const interval = window.setInterval(async () => {
      if (firedRef.current) return;

      const raw = localStorage.getItem(storageKey);
      const last = raw ? Number(raw) : Date.now();
      const idleFor = Date.now() - last;

      if (idleFor >= timeoutMs) {
        firedRef.current = true;
        try {
          await onTimeout();
        } finally {
          // keep fired
        }
      }
    }, checkIntervalMs);

    // also bump when tab becomes visible again
    const onVis = () => {
      if (!document.hidden) bump();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, bump));
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(interval);
    };
  }, [timeoutMs, onTimeout, storageKey, checkIntervalMs]);
}
