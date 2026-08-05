import { retryQueuedShiftArchives } from "@/lib/server/d1-shift-archive";

export async function GET(request) {
  const expected = process.env.CRON_SECRET;
  const token = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!expected || token !== expected) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const results = await retryQueuedShiftArchives(10);
    return Response.json({ processed: results.length, results });
  } catch (error) {
    return Response.json({ error: error?.message || "Archive retry failed." }, { status: 500 });
  }
}
