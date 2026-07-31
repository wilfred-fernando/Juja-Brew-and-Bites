import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

async function requesterIsAdmin() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );
  const { data } = await supabase.auth.getUser();
  if (!data?.user?.id) return false;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  return ["admin", "super_admin"].includes(String(profile?.role || "").toLowerCase());
}

export async function GET(request) {
  if (!(await requesterIsAdmin())) return Response.json({ error: "Admin access required." }, { status: 403 });
  const apiUrl = String(process.env.D1_ARCHIVE_API_URL || "").replace(/\/$/, "");
  const token = process.env.D1_ARCHIVE_API_TOKEN;
  if (!apiUrl || !token) return Response.json({ configured: false }, { status: 503 });
  const source = new URL(request.url);
  const target = new URL(`${apiUrl}/v1/sales`);
  for (const key of ["from", "to", "storeId", "includeItems"]) {
    const value = source.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  try {
    const response = await fetch(target, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" },
    });
  } catch (error) {
    return Response.json({ error: error?.message || "D1 archive is unavailable." }, { status: 502 });
  }
}
