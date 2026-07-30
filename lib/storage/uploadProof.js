function extensionFromFile(file) {
  const extension = String(file?.name || "")
    .split(".")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return extension || "jpg";
}

export async function uploadProofFile({
  supabase,
  file,
  purpose,
  fallbackBucket,
  ownerId,
}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("purpose", purpose);

  try {
    const response = await fetch("/api/uploads/r2", {
      method: "POST",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: formData,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || "R2 upload failed.");
    if (!payload?.url) throw new Error("R2 upload did not return a public URL.");
    return payload.url;
  } catch (r2Error) {
    // Preserve proof submissions while R2 variables are being rolled out.
    const path = `${ownerId || "guest"}/${Date.now()}-${crypto.randomUUID()}.${extensionFromFile(file)}`;
    const { data, error } = await supabase.storage.from(fallbackBucket).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });
    if (error) {
      throw new Error(`${r2Error.message} Supabase fallback failed: ${error.message}`);
    }
    const { data: publicData } = supabase.storage.from(fallbackBucket).getPublicUrl(data.path);
    return publicData?.publicUrl || null;
  }
}
