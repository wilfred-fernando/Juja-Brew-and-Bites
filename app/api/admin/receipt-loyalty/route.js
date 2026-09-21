import { requireAdminApi } from "@/lib/server/admin-api";

export async function GET(request) {
  const { admin, response } = await requireAdminApi();
  if (response) return response;
  const params = new URL(request.url).searchParams;
  const id = params.get("id") || "";
  const source = params.get("source");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      || !["order", "web_order"].includes(source)) {
    return Response.json({ error: "Invalid receipt." }, { status: 400 });
  }
  try {
    async function findAward(type, sourceId) {
      const { data, error } = await admin.from("loyalty_point_award_events")
        .select("available_points_after")
        .eq("source_type", type).eq("source_id", sourceId).maybeSingle();
      if (error) throw error;
      return data;
    }
    let award = await findAward(source, id);
    // Online sales can be awarded against either the web order or its POS receipt.
    if (!award && source === "order") {
      const { data, error } = await admin.from("orders").select("source_web_order_id").eq("id", id).maybeSingle();
      if (error) throw error;
      if (data?.source_web_order_id) award = await findAward("web_order", data.source_web_order_id);
    } else if (!award && source === "web_order") {
      const { data, error } = await admin.from("orders").select("id").eq("source_web_order_id", id);
      if (error) throw error;
      for (const order of data || []) {
        award = await findAward("order", order.id);
        if (award) break;
      }
    }
    return Response.json({ pointsBalance: award?.available_points_after ?? null }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json({ error: "Unable to load receipt points." }, { status: 500 });
  }
}
