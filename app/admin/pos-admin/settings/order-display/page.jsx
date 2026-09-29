"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

async function requestImages(options = {}) {
  const { data } = await getSupabaseClient().auth.getSession();
  const response = await fetch("/api/admin/order-display-images", {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${data.session?.access_token || ""}` },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to manage images.");
  return result;
}

export default function OrderDisplaySettings() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    requestImages().then((data) => { if (active) setImages(data.images); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(""); setMessage("");
    if (file.size > 4 * 1024 * 1024) { setError("Choose an image up to 4 MB."); return; }
    setBusy(true);
    try {
      const body = new FormData(); body.set("file", file);
      const data = await requestImages({ method: "POST", body });
      setImages((rows) => [...rows, data.image]);
      setMessage("Image added. Open displays update within 30 seconds.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function remove(image) {
    if (!window.confirm("Remove this image from the order display slideshow?")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await requestImages({ method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: image.id }) });
      setImages((rows) => rows.filter((row) => row.id !== image.id));
      setMessage("Image removed from the slideshow. Open displays update within 30 seconds.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold text-slate-800">Customer Order Display</h1>
        <p className="mt-2 text-sm text-slate-500">Manage images shown beside the customer order queue. Each image displays for 10 seconds.</p></div>
      <a href="/customer-order-display" target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">Open display ↗</a>
    </header>
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <label className="block text-sm font-semibold text-slate-800" htmlFor="display-image">Add a display image</label>
      <p className="my-2 text-xs text-slate-500">JPG, PNG or WebP, up to 4 MB. Landscape images work best. Changes apply to the shared order display.</p>
      <input id="display-image" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || loading} onChange={upload} className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-white disabled:opacity-50" />
    </section>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <p role="status" className="text-sm text-slate-600">{busy ? "Saving changes…" : message}</p>
    <h2 className="text-sm font-semibold text-slate-700">Display images ({images.length})</h2>
    {loading ? <p>Loading images…</p> : !images.length ? <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500">No display images. Upload an image to start the slideshow.</p> :
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{images.map((image, index) => <article key={image.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {/* Display assets use external storage URLs. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.url} alt={`Display image ${index + 1}`} className="aspect-video w-full bg-slate-100 object-contain" />
        <div className="flex items-center justify-between p-3"><span className="text-xs text-slate-500">Image {index + 1}</span>
          <button type="button" disabled={busy} onClick={() => remove(image)} aria-label={`Delete display image ${index + 1}`} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50">Delete image</button></div>
      </article>)}</div>}
  </div>;
}
