import { requireAdminApi } from "@/lib/server/admin-api";

export async function PUT(request) {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;
    const body = await request.json().catch(() => null);
    const ids = body?.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || new Set(ids).size !== ids.length ||
        !ids.every((id) => typeof id === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(id))) {
      return Response.json({ error: "Provide a valid discount order." }, { status: 400 });
    }
    const { error } = await admin.rpc("reorder_pos_discounts", { p_ids: ids });
    if (error?.code === "22023") return Response.json({ error: "Discounts changed. Refresh the list and try again." }, { status: 409 });
    if (error) throw error;
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to save discount order." }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;
    const body = await request.json().catch(() => null);
    const id = String(body?.id || "");
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const type = body?.type;
    const scope = body?.requires_discount_beneficiary ? "item" : body?.scope;
    const variable = type !== "comp" && body?.is_variable === true;
    const value = variable || type === "comp" ? 0 : Number(body?.value);
    if (!/^[a-zA-Z0-9-]{1,100}$/.test(id) || !name || name.length > 200 ||
        !["percent", "fixed", "comp"].includes(type) || !["receipt", "item"].includes(scope) ||
        typeof body?.is_variable !== "boolean" || typeof body?.requires_discount_beneficiary !== "boolean" ||
        !Number.isFinite(value) || value < 0 || (type === "percent" && value > 100)) {
      return Response.json({ error: "Enter a valid name, discount type, scope, and value. Percent discounts must be between 0 and 100." }, { status: 400 });
    }
    // Only edit these fields; preserve promotion schedules, activity and ordering.
    const { data, error } = await admin.from("pos_discounts").update({
      name, type, scope, value, is_variable: variable,
      requires_discount_beneficiary: body.requires_discount_beneficiary,
    }).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "This discount is no longer available. Refresh and try again." }, { status: 404 });
    return Response.json({ discount: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to update discount." }, { status: 500 });
  }
}
