import { requireArchiveRole } from "@/lib/server/archive-auth";

export async function GET(request) {
  const guard = await requireArchiveRole();
  if (!guard.allowed) return Response.json({ error: guard.error }, { status: guard.status });
  const apiUrl = String(process.env.D1_ARCHIVE_API_URL || "").replace(/\/$/, "");
  const token = process.env.D1_ARCHIVE_API_TOKEN;
  if (!apiUrl || !token) return Response.json({ configured: false, orders: [], webOrders: [], orderItems: [] });

  const source = new URL(request.url);
  const target = new URL(`${apiUrl}/v1/sales`);
  for (const key of ["from", "to", "storeId"]) {
    const value = source.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  target.searchParams.set("includeItems", "1");
  try {
    const response = await fetch(target, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    return new Response(await response.text(), {
      status: response.status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" },
    });
  } catch (error) {
    return Response.json({ error: error?.message || "D1 archive is unavailable." }, { status: 502 });
  }
}
