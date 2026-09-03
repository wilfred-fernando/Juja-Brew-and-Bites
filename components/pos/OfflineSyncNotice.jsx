export default function OfflineSyncNotice({ offline, pending, syncing, error, onRetry }) {
  if (!offline && pending === 0 && !error) return null;
  return (
    <div role="status" className="mb-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
      <p>
        {offline ? "Offline mode: using cached POS data." : syncing ? "Online: uploading offline sales." : "Online: waiting to sync offline sales."}
        {pending > 0 ? ` ${pending} sale${pending === 1 ? "" : "s"} pending upload.` : ""}
      </p>
      {error && <p className="break-words text-red-800">Last sync error: {error}</p>}
      {pending > 0 && <p>Keep this device&apos;s app data until all sales have synced.</p>}
      {!offline && (pending > 0 || error) && (
        <button type="button" disabled={syncing} onClick={onRetry} className="rounded-lg border border-amber-300 bg-white px-3 py-2 font-bold disabled:opacity-50">
          {syncing ? "Syncing..." : "Retry sync"}
        </button>
      )}
    </div>
  );
}
