"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

export default function ApkDownloadBanner({
  manifestUrl,
  storageKey,
  title,
  description,
  logo,
  className = "",
  cta = "Download App",
}) {
  const [manifest, setManifest] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadManifest() {
      try {
        if (Capacitor.isNativePlatform()) return;
        if (storageKey && localStorage.getItem(storageKey) === "true") return;
        const response = await fetch(`${manifestUrl}?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!active || !data?.apkUrl) return;
        setManifest(data);
        setVisible(true);
      } catch (error) {
        console.warn("APK download banner manifest failed", error);
      }
    }

    loadManifest();
    return () => {
      active = false;
    };
  }, [manifestUrl, storageKey]);

  function dismiss() {
    if (storageKey) localStorage.setItem(storageKey, "true");
    setVisible(false);
  }

  if (!visible || !manifest?.apkUrl) return null;

  return (
    <div className={className}>
      {logo ? (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
          <img src={logo} alt="" className="h-8 w-8 object-contain" />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-slate-900">{title}</p>
        <p className="mt-0.5 text-[10px] font-medium leading-snug text-slate-500">
          {description || `Version ${manifest.latestVersion || "latest"} is available.`}
        </p>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        <a
          href={manifest.apkUrl}
          download
          className="rounded-lg bg-cyan-700 px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-cyan-800 active:scale-95"
        >
          {cta}
        </a>
        <button
          type="button"
          onClick={dismiss}
          className="text-center text-[9px] font-bold uppercase tracking-wider text-slate-500 transition hover:text-slate-800"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
