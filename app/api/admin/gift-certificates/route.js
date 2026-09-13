import { requireAdminApi } from "@/lib/server/admin-api";
import { monitorCertificates } from "@/lib/giftCertificateMonitoring";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { admin, response } = await requireAdminApi();
  if (response) return response;
  const params = new URL(request.url).searchParams;
  try {
    const certificateId = params.get("certificateId");
    if (certificateId) {
      if (!/^[0-9a-f-]{36}$/i.test(certificateId)) return Response.json({ error: "Invalid certificate." }, { status: 400 });
      const results = await Promise.all([
        admin.from("booking_gc_redemptions").select("*").eq("certificate_id", certificateId),
        admin.from("web_gc_release_events").select("*").eq("certificate_id", certificateId).order("released_at", { ascending: false }),
      ]);
      for (const result of results) if (result.error) throw result.error;
      return Response.json({ redemptions: results[0].data, releases: results[1].data }, { headers: { "Cache-Control": "no-store" } });
    }
    // Walk every page so totals never silently stop at the API row limit.
    const certificates = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await admin.from("booking_gc_certificates")
        .select("id,code,amount,status,sequence_number,redeemed_at,booking_gc_batches!inner(id,booking_id,purchase_id,customer_name,customer_email,status,email_status,email_error,created_at,expires_at,approved_at,emailed_at)")
        .order("id").range(offset, offset + 499);
      if (error) throw error;
      certificates.push(...data);
      if (data.length < 500) break;
    }
    certificates.sort((a, b) => b.booking_gc_batches.created_at.localeCompare(a.booking_gc_batches.created_at) || a.sequence_number - b.sequence_number);
    return Response.json(monitorCertificates(certificates, Object.fromEntries(params)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error.message || "Unable to load e-GC monitoring." }, { status: 500 });
  }
}
