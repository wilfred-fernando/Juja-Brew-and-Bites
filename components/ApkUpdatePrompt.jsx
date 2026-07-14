"use client";

import { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

function parseVersion(value) {
  return String(value || "0")
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function isNewerVersion(latest, current) {
  const latestBuild = Number(latest?.latestBuild || 0);
  const currentBuild = Number(current?.build || current?.buildNumber || 0);
  if (latestBuild && currentBuild && latestBuild > currentBuild) return true;
  return compareVersions(latest?.latestVersion, current?.version) > 0;
}

export default function ApkUpdatePrompt({
  manifestUrl,
  appLabel = "app",
  title,
}) {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkForUpdate() {
      try {
        if (!manifestUrl || !Capacitor.isNativePlatform()) return;

        const [appInfo, manifestResponse] = await Promise.all([
          App.getInfo(),
          fetch(`${manifestUrl}?t=${Date.now()}`, { cache: "no-store" }),
        ]);

        if (!manifestResponse.ok) return;
        const manifest = await manifestResponse.json();
        if (cancelled || !isNewerVersion(manifest, appInfo)) return;

        setUpdateInfo({
          ...manifest,
          currentVersion: appInfo.version,
          currentBuild: appInfo.build,
        });
      } catch (error) {
        console.warn(`${appLabel} APK update check skipped:`, error);
      }
    }

    checkForUpdate();
    return () => {
      cancelled = true;
    };
  }, [appLabel, manifestUrl]);

  const apkUrl = useMemo(() => updateInfo?.apkUrl || "", [updateInfo]);

  if (!updateInfo || hidden) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-cyan-100 bg-white p-6 text-slate-900 shadow-2xl">
        <div className="mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-700">App Update</p>
          <h2 className="mt-2 text-2xl font-semibold">{title || `New ${appLabel} app available`}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Your installed app is version {updateInfo.currentVersion || "older"}. Please update to version{" "}
            {updateInfo.latestVersion} to get the latest fixes and features.
          </p>
          {updateInfo.releaseNotes ? (
            <p className="mt-3 rounded-2xl bg-cyan-50 p-3 text-xs leading-5 text-slate-700">{updateInfo.releaseNotes}</p>
          ) : null}
        </div>

        <div className="grid gap-3">
          <a
            href={apkUrl}
            download
            className="rounded-2xl bg-gradient-to-r from-cyan-700 to-teal-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-cyan-900/20 transition hover:-translate-y-0.5"
          >
            Download Update
          </a>
          <button
            type="button"
            onClick={() => setHidden(true)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
