import { requireAdminApi } from "@/lib/server/admin-api";

const FIELDS = "id, store_id, name, is_active, sort_order, created_at";
const validId = (id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function POST(request) {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100) return Response.json({ error: "Enter a payment type name of up to 100 characters." }, { status: 400 });
    const { data: rows, error: readError } = await admin.from("pos_payment_types").select("name, sort_order").is("store_id", null);
    if (readError) throw readError;
    if (rows.some((row) => row.name.trim().toLowerCase() === name.toLowerCase())) return Response.json({ error: "A payment type with this name already exists." }, { status: 409 });
    const sortOrder = rows.length ? Math.max(...rows.map((row) => row.sort_order ?? 0)) + 1 : 0;
    const { data, error } = await admin.from("pos_payment_types").insert({ name, store_id: null, is_active: true, sort_order: sortOrder }).select(FIELDS).single();
    if (error?.code === "23505") return Response.json({ error: "A payment type with this name already exists." }, { status: 409 });
    if (error) throw error;
    return Response.json({ paymentType: data }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to add payment type." }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;
    const body = await request.json().catch(() => null);
    if (!validId(body?.id)) return Response.json({ error: "Select a valid payment type." }, { status: 400 });
    const { data, error } = await admin.from("pos_payment_types").delete().eq("id", body.id).is("store_id", null).select("id").maybeSingle();
    if (error?.code === "23503") return Response.json({ error: "This payment type is used by saved records. Deactivate it instead." }, { status: 409 });
    if (error) throw error;
    if (!data) return Response.json({ error: "This global payment type is no longer available. Refresh the list." }, { status: 404 });
    return Response.json({ deleted: data.id });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to delete payment type." }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;
    const body = await request.json().catch(() => null);
    const ids = body?.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(validId) || new Set(ids).size !== ids.length) {
      return Response.json({ error: "Provide a valid payment type order." }, { status: 400 });
    }
    const { data: rows, error: readError } = await admin.from("pos_payment_types").select("id").is("store_id", null);
    if (readError) throw readError;
    if (rows.length !== ids.length || rows.some((row) => !ids.includes(row.id))) return Response.json({ error: "Payment types changed. Refresh the list before reordering." }, { status: 409 });
    // Update only sort_order; never upsert stale names or activation flags.
    for (const [sort_order, id] of ids.entries()) {
      const { data, error } = await admin.from("pos_payment_types").update({ sort_order }).eq("id", id).is("store_id", null).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return Response.json({ error: "Payment types changed during sorting. Refresh and try again." }, { status: 409 });
    }
    return Response.json({ saved: true });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to save payment type order." }, { status: 500 });
  }
}

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
