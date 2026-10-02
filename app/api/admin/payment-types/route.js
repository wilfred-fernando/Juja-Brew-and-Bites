import { requireAdminApi } from "@/lib/server/admin-api";

const FIELDS = "id, store_id, name, is_active, sort_order, created_at";

export async function PATCH(request) {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;
    const body = await request.json().catch(() => null);
    if (typeof body?.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) {
      return Response.json({ error: "Select a valid payment type." }, { status: 400 });
    }
    const updates = {};
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name || name.length > 100) {
        return Response.json({ error: "Enter a payment type name of up to 100 characters." }, { status: 400 });
      }
      updates.name = name;
    }
    if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
    if (!Object.keys(updates).length) {
      return Response.json({ error: "Provide a name or active status to update." }, { status: 400 });
    }
    const { data, error } = await admin.from("pos_payment_types")
      .update(updates).eq("id", body.id).is("store_id", null)
      .select(FIELDS).maybeSingle();
    if (error?.code === "23505") {
      return Response.json({ error: "A payment type with this name already exists." }, { status: 409 });
    }
    if (error) throw error;
    if (!data) {
      return Response.json({ error: "This global payment type is no longer available. Refresh the list and try again." }, { status: 404 });
    }
    return Response.json({ paymentType: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to update payment type." }, { status: 500 });
  }
}
