"use client";

import ApkUpdatePrompt from "@/components/ApkUpdatePrompt";

export default function PosApkUpdatePrompt() {
  return (
    <ApkUpdatePrompt
      manifestUrl="/app-updates/pos.json"
      appLabel="POS"
      title="New POS app available"
    />
  );
}
