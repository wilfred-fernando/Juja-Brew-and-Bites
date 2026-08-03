import { normalizePublicHttpUrl } from "@/lib/storage/publicUrl";

export async function uploadProofFile({
  supabase,
  file,
  purpose,
}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("purpose", purpose);

  const response = await fetch("/api/uploads/r2", {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "R2 upload failed.");
  const publicUrl = normalizePublicHttpUrl(payload?.url);
  if (!publicUrl) throw new Error("R2 upload did not return a valid public URL.");
  return publicUrl;
}
