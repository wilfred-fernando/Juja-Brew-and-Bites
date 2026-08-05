import { createClient } from "@supabase/supabase-js";

export async function GET(request) {
  const expected = process.env.CRON_SECRET;
  const token = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!expected || token !== expected) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return Response.json({ error: "Supabase service configuration is missing." }, { status: 500 });
  }

  try {
    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.rpc("run_approved_sales_archive_purge");
    if (error) throw error;
    const results = Array.isArray(data) ? data : [];
    const deletedRows = results.reduce((sum, row) => sum + Number(row?.deleted_rows || 0), 0);
    return Response.json({ deletedRows, results });
  } catch (error) {
    return Response.json({ error: error?.message || "Archive purge failed." }, { status: 500 });
  }
}
