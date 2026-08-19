import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { replyForMessengerEvent, sendMessengerMessage } from "@/lib/messenger";

const MAX_NODE_STEPS = 20;

function clean(value) {
  return String(value || "").trim();
}

function adminClient() {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !serviceRoleKey) throw new Error("Messenger routing requires Supabase server credentials.");
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function inboundEvent(event) {
  const psid = clean(event?.sender?.id);
  const payload = clean(event?.postback?.payload || event?.message?.quick_reply?.payload);
  const text = clean(event?.message?.text);
  const eventType = event?.postback ? "postback" : event?.message?.attachments?.length ? "attachment" : "message";
  const sourceId = clean(event?.message?.mid || event?.postback?.mid);
  const digest = createHash("sha256").update(JSON.stringify(event)).digest("hex");

  return {
    eventId: sourceId || `messenger:${digest}`,
    eventType,
    payload,
    psid,
    text,
  };
}

function triggerMatches(trigger, input) {
  const pattern = clean(trigger?.pattern);
  const payload = input.payload.toUpperCase();
  const text = input.text.toLowerCase();
  const candidate = trigger.trigger_type === "keyword" ? text : payload;
  const expected = trigger.trigger_type === "keyword" ? pattern.toLowerCase() : pattern.toUpperCase();

  if (trigger.trigger_type === "fallback") return true;
  if (trigger.trigger_type === "get_started") return payload === "GET_STARTED";
  if (trigger.trigger_type === "postback" && !payload) return false;
  if (trigger.trigger_type === "keyword" && !text) return false;

  if (trigger.match_type === "contains") return candidate.includes(expected);
  if (trigger.match_type === "starts_with") return candidate.startsWith(expected);
  if (trigger.match_type === "regex") {
    try {
      return new RegExp(pattern, "i").test(trigger.trigger_type === "keyword" ? input.text : input.payload);
    } catch {
      return false;
    }
  }
  return candidate === expected;
}

function getContextValue(context, field) {
  return clean(field).split(".").filter(Boolean).reduce((value, key) => value?.[key], context);
}

function edgeMatches(edge, context) {
  const condition = edge?.condition || {};
  if (!condition.field) return true;
  const actual = getContextValue(context, condition.field);
  const expected = condition.value;

  if (condition.operator === "not_equals") return String(actual) !== String(expected);
  if (condition.operator === "contains") return String(actual || "").toLowerCase().includes(String(expected || "").toLowerCase());
  if (condition.operator === "exists") return actual !== null && actual !== undefined && actual !== "";
  return String(actual) === String(expected);
}

function nextNodeKey(edges, nodeKey, context, preferredHandle = "") {
  const candidates = edges
    .filter((edge) => edge.source_node_key === nodeKey)
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));

  if (preferredHandle) {
    const preferred = candidates.find((edge) => clean(edge.source_handle).toLowerCase() === preferredHandle.toLowerCase());
    if (preferred && edgeMatches(preferred, context)) return preferred.target_node_key;
  }
  return candidates.find((edge) => clean(edge.source_handle || "default") === "default" && edgeMatches(edge, context))?.target_node_key
    || candidates.find((edge) => edgeMatches(edge, context))?.target_node_key
    || null;
}

function interpolate(value, context) {
  return clean(value).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, field) => {
    if (field === "order_url") return clean(process.env.MESSENGER_ORDER_URL);
    return clean(getContextValue(context, field));
  });
}

function nodeMessage(node, context) {
  const config = node?.config || {};
  const text = interpolate(config.text, context).slice(0, 2000);
  const quickReplies = (config.quick_replies || []).slice(0, 13).map((reply) => ({
    content_type: "text",
    title: clean(reply.title).slice(0, 20),
    payload: clean(reply.payload).slice(0, 1000),
  })).filter((reply) => reply.title && reply.payload);
  const buttons = (config.buttons || []).slice(0, 3).map((button) => button.type === "web_url"
    ? { type: "web_url", title: clean(button.title).slice(0, 20), url: interpolate(button.url, context), webview_height_ratio: "full" }
    : { type: "postback", title: clean(button.title).slice(0, 20), payload: clean(button.payload).slice(0, 1000) }
  ).filter((button) => button.title && (button.url || button.payload));

  if (buttons.length) {
    return { attachment: { type: "template", payload: { template_type: "button", text, buttons } } };
  }
  return { text, ...(quickReplies.length ? { quick_replies: quickReplies } : {}) };
}

async function recordOutbound(admin, psid, node, message, result) {
  const eventId = clean(result?.message_id) || `outbound:${randomUUID()}`;
  const { error } = await admin.from("messenger_events").insert({
    event_id: eventId,
    psid,
    direction: "outbound",
    event_type: node.node_type,
    payload: { node_id: node.id, message, result },
    processed_at: new Date().toISOString(),
  });
  if (error && error.code !== "23505") console.error("Unable to record Messenger outbound event:", error);
}

async function sendNodeMessage(admin, psid, node, context) {
  const message = nodeMessage(node, context);
  if (!message.text && !message.attachment) return null;
  const result = await sendMessengerMessage(psid, message);
  await recordOutbound(admin, psid, node, message, result);
  return result;
}

async function applyAction(admin, contact, session, node) {
  const config = node.config || {};
  const context = { ...(session.context || {}) };
  const customFields = { ...(contact.custom_fields || {}) };
  const tags = new Set(contact.tags || []);

  if (config.action === "set_field" && config.field) {
    customFields[config.field] = interpolate(config.value, context);
    context.custom_fields = customFields;
  }
  if (config.action === "add_tag" && config.tag) tags.add(clean(config.tag));
  if (config.action === "remove_tag" && config.tag) tags.delete(clean(config.tag));

  const updates = { custom_fields: customFields, tags: [...tags] };
  if (config.action === "pause_bot") {
    updates.bot_paused = true;
    updates.pause_reason = clean(config.reason) || "Paused by flow action";
    updates.paused_at = new Date().toISOString();
  }
  const { error } = await admin.from("messenger_contacts").update(updates).eq("psid", contact.psid);
  if (error) throw error;
  return { context, contact: { ...contact, ...updates } };
}

async function loadFlowGraph(admin, flowId) {
  const [flowResult, nodesResult, edgesResult] = await Promise.all([
    admin.from("messenger_flows").select("*").eq("id", flowId).eq("status", "published").maybeSingle(),
    admin.from("messenger_flow_nodes").select("*").eq("flow_id", flowId),
    admin.from("messenger_flow_edges").select("*").eq("flow_id", flowId).order("priority", { ascending: false }),
  ]);
  if (flowResult.error) throw flowResult.error;
  if (nodesResult.error) throw nodesResult.error;
  if (edgesResult.error) throw edgesResult.error;
  return { flow: flowResult.data, nodes: nodesResult.data || [], edges: edgesResult.data || [] };
}

async function finishSession(admin, sessionId, status = "completed") {
  const { error } = await admin.from("messenger_sessions").update({
    status,
    waiting_for_input: false,
    completed_at: status === "completed" ? new Date().toISOString() : null,
  }).eq("id", sessionId);
  if (error) throw error;
}

async function executeFlow(admin, contact, session, startNodeKey) {
  let graph = await loadFlowGraph(admin, session.flow_id);
  let nodeKey = startNodeKey;
  let currentContact = contact;
  let currentSession = session;

  for (let step = 0; step < MAX_NODE_STEPS; step += 1) {
    const node = graph.nodes.find((candidate) => candidate.node_key === nodeKey);
    if (!node) throw new Error(`Messenger flow node not found: ${nodeKey}`);
    let context = { ...(currentSession.context || {}) };

    if (node.node_type === "message") {
      await sendNodeMessage(admin, currentContact.psid, node, context);
    } else if (node.node_type === "question") {
      await sendNodeMessage(admin, currentContact.psid, node, context);
      const { error } = await admin.from("messenger_sessions").update({
        current_node_key: node.node_key,
        waiting_for_input: true,
        context,
      }).eq("id", currentSession.id);
      if (error) throw error;
      return { waiting: true };
    } else if (node.node_type === "action") {
      const applied = await applyAction(admin, currentContact, currentSession, node);
      currentContact = applied.contact;
      context = applied.context;
      currentSession = { ...currentSession, context };
    } else if (node.node_type === "handoff") {
      await sendNodeMessage(admin, currentContact.psid, node, context);
      const pausedAt = new Date().toISOString();
      const { error: contactError } = await admin.from("messenger_contacts").update({
        bot_paused: true,
        pause_reason: clean(node.config?.reason) || "Customer requested staff",
        paused_at: pausedAt,
      }).eq("psid", currentContact.psid);
      if (contactError) throw contactError;
      await finishSession(admin, currentSession.id, "paused");
      return { handedOff: true };
    } else if (node.node_type === "goto") {
      const slug = clean(node.config?.flow_slug);
      const id = clean(node.config?.flow_id);
      let query = admin.from("messenger_flows").select("*").eq("status", "published");
      query = id ? query.eq("id", id) : query.eq("slug", slug);
      const { data: targetFlow, error } = await query.maybeSingle();
      if (error || !targetFlow) throw error || new Error("Target Messenger flow was not found.");
      graph = await loadFlowGraph(admin, targetFlow.id);
      nodeKey = clean(node.config?.node_key) || targetFlow.start_node_key;
      const { error: sessionError } = await admin.from("messenger_sessions").update({
        flow_id: targetFlow.id,
        current_node_key: nodeKey,
        context,
      }).eq("id", currentSession.id);
      if (sessionError) throw sessionError;
      currentSession = { ...currentSession, flow_id: targetFlow.id, current_node_key: nodeKey, context };
      continue;
    } else if (node.node_type === "end") {
      await finishSession(admin, currentSession.id);
      return { completed: true };
    }

    const next = nextNodeKey(graph.edges, node.node_key, context);
    if (!next) {
      await finishSession(admin, currentSession.id);
      return { completed: true };
    }
    nodeKey = next;
    const { error } = await admin.from("messenger_sessions").update({ current_node_key: nodeKey, context }).eq("id", currentSession.id);
    if (error) throw error;
    currentSession = { ...currentSession, current_node_key: nodeKey, context };
  }

  await finishSession(admin, currentSession.id, "failed");
  throw new Error(`Messenger flow exceeded ${MAX_NODE_STEPS} node steps.`);
}

async function resumeQuestion(admin, contact, session, input) {
  const graph = await loadFlowGraph(admin, session.flow_id);
  const question = graph.nodes.find((node) => node.node_key === session.current_node_key);
  if (!question || question.node_type !== "question") {
    await finishSession(admin, session.id, "failed");
    return null;
  }

  const answer = input.payload || input.text;
  const field = clean(question.config?.field) || "answer";
  const customFields = { ...(contact.custom_fields || {}), [field]: answer };
  const context = { ...(session.context || {}), answer, last_answer: answer, custom_fields: customFields };
  const next = nextNodeKey(graph.edges, question.node_key, context, clean(answer));

  const { error: contactError } = await admin.from("messenger_contacts").update({ custom_fields: customFields }).eq("psid", contact.psid);
  if (contactError) throw contactError;
  if (!next) {
    await finishSession(admin, session.id);
    return { completed: true };
  }

  const { error: sessionError } = await admin.from("messenger_sessions").update({
    current_node_key: next,
    waiting_for_input: false,
    context,
  }).eq("id", session.id);
  if (sessionError) throw sessionError;
  return executeFlow(admin, { ...contact, custom_fields: customFields }, { ...session, current_node_key: next, waiting_for_input: false, context }, next);
}

async function matchingFlow(admin, input) {
  const [triggerResult, flowResult] = await Promise.all([
    admin.from("messenger_triggers").select("*").eq("is_active", true).order("priority", { ascending: false }),
    admin.from("messenger_flows").select("*").eq("status", "published"),
  ]);
  if (triggerResult.error) throw triggerResult.error;
  if (flowResult.error) throw flowResult.error;
  const flows = new Map((flowResult.data || []).map((flow) => [flow.id, flow]));
  const match = (triggerResult.data || []).find((trigger) => flows.has(trigger.flow_id) && triggerMatches(trigger, input));
  return match ? flows.get(match.flow_id) : null;
}

async function routeEventWithDatabase(event) {
  const input = inboundEvent(event);
  if (!input.psid || event?.message?.is_echo || event?.delivery || event?.read || event?.reaction) return { ignored: true };
  const admin = adminClient();
  const now = new Date().toISOString();

  const { data: contact, error: contactError } = await admin.from("messenger_contacts").upsert({
    psid: input.psid,
    last_message_at: now,
  }, { onConflict: "psid" }).select("*").single();
  if (contactError) throw contactError;

  const { error: eventError } = await admin.from("messenger_events").insert({
    event_id: input.eventId,
    psid: input.psid,
    direction: "inbound",
    event_type: input.eventType,
    payload: event,
  });
  if (eventError?.code === "23505") return { duplicate: true };
  if (eventError) throw eventError;

  if (contact.bot_paused) {
    await admin.from("messenger_events").update({ processed_at: now }).eq("event_id", input.eventId);
    return { paused: true };
  }

  try {
    const { data: activeSession, error: sessionLookupError } = await admin
      .from("messenger_sessions")
      .select("*")
      .eq("psid", input.psid)
      .eq("status", "active")
      .maybeSingle();
    if (sessionLookupError) throw sessionLookupError;

    let result;
    if (activeSession?.waiting_for_input) {
      result = await resumeQuestion(admin, contact, activeSession, input);
    } else {
      if (activeSession) await finishSession(admin, activeSession.id);
      const flow = await matchingFlow(admin, input);
      if (!flow) return { ignored: true };
      const { data: session, error: sessionError } = await admin.from("messenger_sessions").insert({
        psid: input.psid,
        flow_id: flow.id,
        current_node_key: flow.start_node_key,
        context: { inbound_text: input.text, inbound_payload: input.payload, custom_fields: contact.custom_fields || {} },
      }).select("*").single();
      if (sessionError) throw sessionError;
      result = await executeFlow(admin, contact, session, flow.start_node_key);
    }

    await admin.from("messenger_events").update({ processed_at: new Date().toISOString() }).eq("event_id", input.eventId);
    return result || { processed: true };
  } catch (error) {
    await admin.from("messenger_events").update({ processing_error: error?.message || "Routing failed." }).eq("event_id", input.eventId);
    throw error;
  }
}

async function fallbackRoute(event) {
  const recipientId = clean(event?.sender?.id);
  const message = replyForMessengerEvent(event);
  if (!recipientId || !message) return { ignored: true };
  await sendMessengerMessage(recipientId, message);
  return { sent: true, fallback: true };
}

function databaseRouterUnavailable(error) {
  const code = clean(error?.code).toUpperCase();
  const message = clean(error?.message).toLowerCase();
  return code === "42P01"
    || code === "PGRST205"
    || message.includes("messenger routing requires supabase server credentials")
    || (message.includes("messenger_") && message.includes("schema cache"));
}

export async function processMessengerWebhook(payload) {
  const events = (payload?.entry || []).flatMap((entry) => entry?.messaging || []);
  const outcomes = [];

  for (const event of events) {
    try {
      outcomes.push(await routeEventWithDatabase(event));
    } catch (error) {
      console.error("Messenger database router failed:", error);
      if (databaseRouterUnavailable(error)) {
        try {
          outcomes.push(await fallbackRoute(event));
        } catch (fallbackError) {
          console.error("Messenger fallback reply failed:", fallbackError);
          outcomes.push({ failed: true });
        }
      } else {
        outcomes.push({ failed: true });
      }
    }
  }

  return {
    events: events.length,
    sent: outcomes.filter((outcome) => outcome?.sent || outcome?.completed || outcome?.waiting || outcome?.handedOff).length,
    failed: outcomes.filter((outcome) => outcome?.failed).length,
    duplicates: outcomes.filter((outcome) => outcome?.duplicate).length,
    paused: outcomes.filter((outcome) => outcome?.paused).length,
  };
}
