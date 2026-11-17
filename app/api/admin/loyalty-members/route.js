import { requireAdminApi } from "@/lib/server/admin-api";

export async function DELETE(request) {
  const { admin, response } = await requireAdminApi();
  if (response) return response;
  try {
    const body = await request.json().catch(() => null);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body?.id || "")) {
      return Response.json({ error: "Select a valid loyalty member." }, { status: 400 });
    }
    const { data: profiles, error: profileError } = await admin.from("profiles").select("id").eq("loyalty_account_id", body.id).limit(1);
    if (profileError) throw profileError;
    if (profiles?.length) return Response.json({ error: "This member is linked to an account. Unlink it before deleting." }, { status: 409 });
    // Return the deleted row: an empty result must never be reported as success.
    const { data, error } = await admin.from("loyalty_members").delete().eq("id", body.id).is("user_id", null).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "Member was not deleted. It may be linked or already removed. Refresh the list." }, { status: 409 });
    return Response.json({ deleted: data.id }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error.code === "23503" ? "This member has related records and cannot be deleted." : error.message || "Unable to delete member." }, { status: 400 });
  }
}
