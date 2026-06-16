"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const PORTAL_MANIFESTS = [
  { hostPrefix: "pos.", pathPrefix: "/kitchen", href: "/manifest-kds.json" },
  { hostPrefix: "customer.", pathPrefix: "/customer", href: "/manifest-customer.json" },
  { hostPrefix: "admin.", pathPrefix: "/admin", href: "/manifest-admin.json" },
  { hostPrefix: "pos.", pathPrefix: "/pos", href: "/manifest-pos.json" },
  { hostPrefix: "finance.", pathPrefix: "/finance", href: "/manifest-finance.json" },
];

function resolveManifest(pathname) {
  if (typeof window === "undefined") return "";
  const host = window.location.hostname.toLowerCase();

  const pathMatch = PORTAL_MANIFESTS.find((item) => pathname === item.pathPrefix || pathname.startsWith(`${item.pathPrefix}/`));
  if (pathMatch) return pathMatch.href;

  const hostMatch = PORTAL_MANIFESTS.find((item) => host.startsWith(item.hostPrefix));
  return hostMatch?.href || "";
}

export default function PwaManifestManager() {
  const pathname = usePathname();

  useEffect(() => {
    const href = resolveManifest(pathname);
    const existingLinks = Array.from(document.querySelectorAll("link[rel='manifest']"));

    if (!href) {
      existingLinks.forEach((link) => link.remove());
      return;
    }

    const [link, ...extraLinks] = existingLinks;
    extraLinks.forEach((extra) => extra.remove());

    const manifestLink = link || document.createElement("link");
    manifestLink.rel = "manifest";
    manifestLink.href = href;
    if (!link) document.head.appendChild(manifestLink);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, [pathname]);

  return null;
}
