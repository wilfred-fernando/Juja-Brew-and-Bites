import { requireAdminApi } from "@/lib/server/admin-api";

function clean(value) {
  return String(value || "").trim();
}

function slugify(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function messageConfig(body) {
  const text = clean(body?.text);
  if (!text) throw new Error("Flow message is required.");
  return {
    text,
    quick_replies: Array.isArray(body?.quick_replies) ? body.quick_replies : [],
    buttons: Array.isArray(body?.buttons) ? body.buttons : [],
  };
}

async function loadFlows(admin) {
  const [flows, nodes, edges, triggers] = await Promise.all([
    admin.from("messenger_flows").select("*").order("created_at"),
    admin.from("messenger_flow_nodes").select("*").order("position_y"),
    admin.from("messenger_flow_edges").select("*").order("priority", { ascending: false }),
    admin.from("messenger_triggers").select("*").order("priority", { ascending: false }),
  ]);
  const error = flows.error || nodes.error || edges.error || triggers.error;
  if (error) throw error;
  return (flows.data || []).map((flow) => ({
    ...flow,
    nodes: (nodes.data || []).filter((node) => node.flow_id === flow.id),
    edges: (edges.data || []).filter((edge) => edge.flow_id === flow.id),
    triggers: (triggers.data || []).filter((trigger) => trigger.flow_id === flow.id),
  }));
}

export async function GET() {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;
    return Response.json({ flows: await loadFlows(admin) });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to load Messenger flows." }, { status: 500 });
  }
}

export async function POST(request) {
  let createdFlowId = null;
  try {
    const { admin, user, response } = await requireAdminApi();
    if (response) return response;
    const body = await request.json();
    const name = clean(body?.name);
    const slug = slugify(body?.slug || name);
    if (!name || !slug) return Response.json({ error: "Flow name is required." }, { status: 400 });
    const triggerType = clean(body?.trigger_type || "keyword");
    const pattern = clean(body?.pattern);
    if (triggerType !== "fallback" && !pattern) return Response.json({ error: "Trigger pattern is required." }, { status: 400 });

    const { data: flow, error: flowError } = await admin.from("messenger_flows").insert({
      name,
      slug,
      description: clean(body?.description),
      status: body?.status === "published" ? "published" : "draft",
      start_node_key: "start",
      created_by: user.id,
    }).select("*").single();
    if (flowError) throw flowError;
    createdFlowId = flow.id;

    const [nodeResult, triggerResult] = await Promise.all([
      admin.from("messenger_flow_nodes").insert({
        flow_id: flow.id,
        node_key: "start",
        node_type: "message",
        name: "Start message",
        config: messageConfig(body),
        position_x: 80,
        position_y: 80,
      }),
      admin.from("messenger_triggers").insert({
        flow_id: flow.id,
        trigger_type: triggerType,
        pattern,
        match_type: clean(body?.match_type || "contains"),
        priority: Number(body?.priority || 0),
      }),
    ]);
    if (nodeResult.error || triggerResult.error) throw nodeResult.error || triggerResult.error;
    return Response.json({ success: true, flow: (await loadFlows(admin)).find((row) => row.id === flow.id) }, { status: 201 });
  } catch (error) {
    if (createdFlowId) {
      const guarded = await requireAdminApi();
      if (guarded.admin) await guarded.admin.from("messenger_flows").delete().eq("id", createdFlowId);
    }
    return Response.json({ error: error?.message || "Unable to create Messenger flow." }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;
    const body = await request.json();
    const flowId = clean(body?.flow_id);
    if (!flowId) return Response.json({ error: "Flow ID is required." }, { status: 400 });

    if (body.flow) {
      const allowed = {};
      if (body.flow.name !== undefined) allowed.name = clean(body.flow.name);
      if (body.flow.description !== undefined) allowed.description = clean(body.flow.description);
      if (["draft", "published", "archived"].includes(body.flow.status)) allowed.status = body.flow.status;
      if (Object.keys(allowed).length) {
        const { error } = await admin.from("messenger_flows").update(allowed).eq("id", flowId);
        if (error) throw error;
      }
    }

    if (body.node) {
      const nodeId = clean(body.node.id);
      if (!nodeId) return Response.json({ error: "Node ID is required." }, { status: 400 });
      const updates = {};
      if (body.node.name !== undefined) updates.name = clean(body.node.name);
      if (body.node.config !== undefined) updates.config = body.node.config;
      const { error } = await admin.from("messenger_flow_nodes").update(updates).eq("id", nodeId).eq("flow_id", flowId);
      if (error) throw error;
    }

    if (body.trigger) {
      const triggerId = clean(body.trigger.id);
      if (!triggerId) return Response.json({ error: "Trigger ID is required." }, { status: 400 });
      const updates = {};
      if (body.trigger.pattern !== undefined) updates.pattern = clean(body.trigger.pattern);
      if (body.trigger.is_active !== undefined) updates.is_active = Boolean(body.trigger.is_active);
      if (body.trigger.priority !== undefined) updates.priority = Number(body.trigger.priority || 0);
      const { error } = await admin.from("messenger_triggers").update(updates).eq("id", triggerId).eq("flow_id", flowId);
      if (error) throw error;
    }

    return Response.json({ success: true, flow: (await loadFlows(admin)).find((row) => row.id === flowId) });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to update Messenger flow." }, { status: 500 });
  }
}

