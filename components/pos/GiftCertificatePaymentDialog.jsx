"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import GiftCertificatePayment from "./GiftCertificatePayment";

export default function GiftCertificatePaymentDialog({ onClose, checking, ...paymentProps }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return createPortal(
    <dialog ref={dialog} aria-labelledby="pos-gc-dialog-title"
      onCancel={event => { event.preventDefault(); if (!checking) onClose(); }}
      className="m-auto max-h-[90vh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl backdrop:bg-black/50">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="pos-gc-dialog-title" className="text-lg font-bold">Gift Certificate payment</h2>
        <button type="button" aria-label="Close gift certificate payment" disabled={checking} onClick={onClose} className="rounded-lg border px-3 py-2 disabled:opacity-40">✕</button>
      </div>
      <GiftCertificatePayment {...paymentProps} />
      <button type="button" disabled={checking} onClick={onClose} className="mt-4 w-full rounded-xl bg-green-800 p-3 font-semibold text-white disabled:opacity-40">Done</button>
    </dialog>, document.body,
  );
}
