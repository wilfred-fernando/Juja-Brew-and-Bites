"use client";

import ApkUpdatePrompt from "@/components/ApkUpdatePrompt";

export default function CustomerApkUpdatePrompt() {
  return (
    <ApkUpdatePrompt
      manifestUrl="/app-updates/customer.json"
      appLabel="customer"
      title="New customer app available"
    />
  );
}
