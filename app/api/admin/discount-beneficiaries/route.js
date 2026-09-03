import { requireAdminApi } from "@/lib/server/admin-api";

const FIELDS = "id, beneficiary_type, full_name, id_number, is_active, created_at, updated_at";
const PAGE_SIZE = 25;

export async function GET(request) {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Math.min(100000, Math.floor(Number(params.get("page")) || 1)));
    const type = params.get("type") || "";
    const status = params.get("status") || "active";
    if (!["active", "inactive", "all"].includes(status)) {
      return Response.json({ error: "Select a valid beneficiary status." }, { status: 400 });
    }
    if (type && !["pwd", "senior_citizen"].includes(type)) {
      return Response.json({ error: "Select SC or PWD." }, { status: 400 });
    }
    // Keep user input out of PostgREST filter syntax and wildcard operators.
    const search = (params.get("q") || "").slice(0, 120).replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim();
    let query = admin.from("pos_discount_beneficiaries").select(FIELDS, { count: "exact" });
    if (status !== "all") query = query.eq("is_active", status === "active");
    if (type) query = query.eq("beneficiary_type", type);
    if (search) {
      const normalized = search.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      const filters = [`full_name.ilike.%${search}%`, `id_number.ilike.%${search}%`];
      if (normalized) filters.push(`normalized_id_number.ilike.%${normalized}%`);
      query = query.or(filters.join(","));
    }
    const { data, error, count } = await query.order("full_name").order("id")
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) throw error;
    return Response.json({ beneficiaries: data || [], total: count || 0, pageSize: PAGE_SIZE }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to load beneficiaries." }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;
    const body = await request.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id : "";
    const type = body?.beneficiary_type;
    const name = typeof body?.full_name === "string" ? body.full_name.trim().replace(/\s+/g, " ") : "";
    const idNumber = typeof body?.id_number === "string" ? body.id_number.trim() : "";
    const normalized = idNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
        !["pwd", "senior_citizen"].includes(type) || name.length < 3 || name.length > 200 ||
        normalized.length < 3 || idNumber.length > 100 ||
        typeof body?.updated_at !== "string" || !Number.isFinite(Date.parse(body.updated_at))) {
      return Response.json({ error: "Provide a valid beneficiary, SC/PWD type, full name, and ID number." }, { status: 400 });
    }

    // Update by the permanent record ID to retain all redemption references.
    const { data, error } = await admin.from("pos_discount_beneficiaries").update({
      beneficiary_type: type,
      full_name: name,
      id_number: idNumber,
      normalized_id_number: normalized,
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("updated_at", body.updated_at).select(FIELDS).maybeSingle();
    if (error?.code === "23505") {
      return Response.json({ error: "A beneficiary with this identity already exists. Review the saved SC and PWD records before changing these details." }, { status: 409 });
    }
    if (error) throw error;
    if (!data) {
      return Response.json({ error: "This record changed or is no longer available. Cancel, refresh the list, and edit it again." }, { status: 409 });
    }
    return Response.json({ beneficiary: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to update beneficiary." }, { status: 500 });
  }
}
