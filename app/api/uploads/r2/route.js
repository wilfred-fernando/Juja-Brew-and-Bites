import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { uploadR2Object } from "@/lib/storage/r2";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const PURPOSES = new Set(["payment-proofs", "booking_proofs"]);
const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

async function getAuthenticatedUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const cookieStore = await cookies();
  const cookieClient = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        );
      },
    },
  });
  const { data, error } = await cookieClient.auth.getUser();
  if (!error && data?.user) return data.user;

  const headerStore = await headers();
  const token = String(headerStore.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return null;

  const tokenClient = createSupabaseClient(url, anonKey);
  const { data: tokenData, error: tokenError } = await tokenClient.auth.getUser(token);
  if (tokenError) return null;
  return tokenData?.user || null;
}

function fileExtension(file) {
  const fromName = String(file?.name || "")
    .split(".")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (fromName) return fromName;
  if (file?.type === "application/pdf") return "pdf";
  if (file?.type === "image/png") return "png";
  if (file?.type === "image/webp") return "webp";
  return "jpg";
}

export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return Response.json({ error: "Login is required to upload a proof." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const purpose = String(formData.get("purpose") || "").trim();

    if (!PURPOSES.has(purpose)) {
      return Response.json({ error: "Unsupported upload purpose." }, { status: 400 });
    }
    if (!(file instanceof File) || file.size <= 0) {
      return Response.json({ error: "A proof file is required." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return Response.json({ error: "Proof files must be 10 MB or smaller." }, { status: 413 });
    }
    if (!MIME_TYPES.has(file.type)) {
      return Response.json(
        { error: "Only JPG, PNG, WebP, and PDF proof files are supported." },
        { status: 415 }
      );
    }

    const key = `${purpose}/${user.id}/${Date.now()}-${crypto.randomUUID()}.${fileExtension(file)}`;
    const result = await uploadR2Object({
      key,
      body: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error("R2 proof upload failed:", error);
    return Response.json({ error: error?.message || "Proof upload failed." }, { status: 500 });
  }
}
