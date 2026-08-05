import { archiveClosedShift } from "@/lib/server/d1-shift-archive";
import { requireArchiveRole } from "@/lib/server/archive-auth";

export async function POST(request) {
  const guard = await requireArchiveRole();
  if (!guard.allowed) return Response.json({ error: guard.error }, { status: guard.status });
  try {
    const { shiftId } = await request.json();
    if (!shiftId) return Response.json({ error: "shiftId is required." }, { status: 400 });
    return Response.json(await archiveClosedShift(shiftId));
  } catch (error) {
    return Response.json({ error: error?.message || "Shift archive failed." }, { status: 502 });
  }
}
