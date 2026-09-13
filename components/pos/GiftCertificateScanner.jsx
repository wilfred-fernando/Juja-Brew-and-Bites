"use client";

import { useEffect, useId, useRef, useState } from "react";

export default function GiftCertificateScanner({ onResult, onClose }) {
  const id = `gc-camera-${useId().replace(/[^a-z0-9]/gi, "")}`;
  const callbacks = useRef({ onResult, onClose });
  callbacks.current = { onResult, onClose };
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let detected = false;
    let scanner;
    const starting = (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera scanning requires HTTPS and a supported browser. You can still type the code or use a USB scanner.");
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;
        scanner = new Html5Qrcode(id, { formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128], verbose: false });
        await scanner.start({ facingMode: "environment" }, {
          fps: 10,
          qrbox: (width, height) => ({ width: Math.max(50, Math.floor(width * 0.94)), height: Math.max(50, Math.floor(height * 0.45)) }),
          disableFlip: true,
        }, text => {
          if (cancelled || detected) return;
          const code = String(text).trim().toUpperCase();
          if (!/^JUJA-GC-[A-Z0-9-]+$/.test(code)) {
            setError("This is not a JUJA e-GC barcode. Scan the barcode below the certificate value.");
            return;
          }
          detected = true;
          callbacks.current.onResult(code);
        }, () => {});
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) setError(err?.name === "NotAllowedError"
          ? "Camera access was denied. Allow camera access in your browser settings, or enter the e-GC code manually."
          : err?.message || "Unable to open the camera. Close the scanner and try again, or enter the code manually.");
      }
    })();
    return () => {
      cancelled = true;
      // A permission prompt may resolve after this component closes. Stop that late stream too.
      void starting.finally(async () => {
        if (!scanner) return;
        try { await scanner.stop(); } catch { /* Camera may not have started. */ }
        try { scanner.clear(); } catch { /* Reader element may already be unmounted. */ }
      });
    };
  }, [id]);

  return <section className="mt-3 rounded-xl border border-green-300 bg-white p-3" aria-label="e-GC camera scanner">
    <p className="text-sm font-semibold">Scan e-GC barcode</p>
    <p className="my-2 text-xs">Open the full-size certificate image and hold the entire barcode inside the camera frame.</p>
    <div id={id} className="min-h-40 overflow-hidden rounded-lg" />
    {!ready && !error && <p role="status" className="mt-2 text-xs">Opening camera… Allow camera access when prompted.</p>}
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    <button type="button" onClick={() => callbacks.current.onClose()} className="mt-3 w-full rounded-lg border p-2 text-xs font-semibold">Close scanner</button>
  </section>;
}
