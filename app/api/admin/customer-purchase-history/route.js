import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

function supabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function getRequesterUser() {
  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey) return null;

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (!error && data?.user) return data.user;

  const headerStore = await headers();
  const token = String(headerStore.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const tokenClient = createSupabaseClient(url, anonKey);
  const { data: tokenData, error: tokenError } = await tokenClient.auth.getUser(token);
  if (tokenError || !tokenData?.user) return null;
  return tokenData.user;
}

async function requireAdmin(adminClient) {
  const requester = await getRequesterUser();
  if (!requester?.id) return { allowed: false, error: "Admin login is required.", status: 401 };

  const { data: profile, error } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", requester.id)
    .maybeSingle();

  if (error) return { allowed: false, error: error.message, status: 500 };

  const role = String(profile?.role || "").toLowerCase();
  if (!["admin", "super_admin"].includes(role)) {
    return { allowed: false, error: "Admin access required.", status: 403 };
  }

  return { allowed: true };
}

function cleanValue(value) {
  return String(value || "").replace(/[%(),]/g, "").trim();
}

function uniqueValues(values) {
  return Array.from(new Set(values.map(cleanValue).filter(Boolean)));
}

function purchaseDedupeKeys(row) {
  const keys = [];
  const receipt = cleanValue(row?.receipt).toLowerCase();
  const webOrderId = cleanValue(row?.webOrderId || row?.sourceWebOrderId).toLowerCase();
  if (receipt) keys.push(`receipt:${receipt}`);
  if (webOrderId) keys.push(`web-order:${webOrderId}`);
  return keys;
}

function preferPurchaseRow(nextRow, currentRow) {
  if (!currentRow) return nextRow;
  if (nextRow?.source === "POS order" && currentRow?.source !== "POS order") return nextRow;
  if (nextRow?.source === currentRow?.source && new Date(nextRow?.date || 0) > new Date(currentRow?.date || 0)) return nextRow;
  return currentRow;
}

function dedupeRows(rows) {
  const keyed = new Map();
  const unkeyed = [];

  rows.forEach((row) => {
    if (!row?.id) return;
    const keys = purchaseDedupeKeys(row);
    if (keys.length === 0) {
      unkeyed.push(row);
      return;
    }

    const current = keys.map((key) => keyed.get(key)).find(Boolean);
    const preferred = preferPurchaseRow(row, current);
    [...keys, ...purchaseDedupeKeys(current || {})].forEach((key) => keyed.set(key, preferred));
  });

  const unique = new Map();
  keyed.forEach((row) => unique.set(row.id, row));
  unkeyed.forEach((row) => unique.set(row.id, row));
  return Array.from(unique.values()).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

async function safeQuery(query, mapper) {
  const { data, error } = await query;
  if (error) return [];
  return (data || []).map(mapper);
}

export async function POST(req) {
  try {
    const { url, serviceRoleKey } = supabaseConfig();
    if (!url || !serviceRoleKey) {
      return Response.json({ error: "Supabase service role key is required." }, { status: 500 });
    }

    const admin = createSupabaseClient(url, serviceRoleKey);
    const guard = await requireAdmin(admin);
    if (!guard.allowed) return Response.json({ error: guard.error }, { status: guard.status });

    const { memberId } = await req.json();
    if (!memberId) return Response.json({ error: "Loyalty member is required." }, { status: 400 });

    const { data: member, error: memberError } = await admin
      .from("loyalty_members")
      .select("*")
      .eq("id", memberId)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!member?.id) return Response.json({ rows: [] });

    const name = cleanValue(member.customer_name || member.name);
    const email = cleanValue(member.Email || member.email);
    const phone = cleanValue(member.Phone || member.phone);
    const userId = cleanValue(member.user_id || member.profile_id);
    const codes = uniqueValues([member.customer_code, member["Customer ID"], member.customer_id, member.id]);

    const posMapper = (row) => ({
      id: `pos-${row.id}`,
      sourceWebOrderId: row.source_web_order_id || "",
      source: "POS order",
      date: row.paid_at || row.created_at,
      receipt: row.receipt_number || row.order_number || String(row.id).slice(0, 12),
      store: row.source_store_name || row.order_type || row.dining_option || "POS",
      payment: row.payment_method,
      total: Number(row.net_amount || row.total || 0),
      status: row.status,
    });

    const webMapper = (row) => ({
      id: `web-${row.id}`,
      webOrderId: row.id,
      source: "Web order",
      date: row.completed_at || row.created_at,
      receipt: row.receipt_number || `WEB-${String(row.id).slice(0, 8).toUpperCase()}`,
      store: row.dining_option || row.fulfillment_type || "Web",
      payment: row.payment_method,
      total: Number(row.total || 0),
      status: row.status,
    });

    const posSelect = "id,created_at,paid_at,receipt_number,order_number,source_web_order_id,customer_name,customer_id,loyalty_member_id,user_id,total,net_amount,payment_method,status,order_type,dining_option,source_store_name";
    const webSelect = "id,created_at,completed_at,receipt_number,customer_name,customer_contact,total,payment_method,status,dining_option,fulfillment_type,user_id";

    const posQueries = [
      ...codes.map((value) => safeQuery(admin.from("orders").select(posSelect).eq("customer_id", value).order("created_at", { ascending: false }).limit(250), posMapper)),
      safeQuery(admin.from("orders").select(posSelect).eq("loyalty_member_id", member.id).order("created_at", { ascending: false }).limit(250), posMapper),
      ...(name ? [safeQuery(admin.from("orders").select(posSelect).ilike("customer_name", `%${name}%`).order("created_at", { ascending: false }).limit(250), posMapper)] : []),
      ...(userId ? [safeQuery(admin.from("orders").select(posSelect).eq("user_id", userId).order("created_at", { ascending: false }).limit(250), posMapper)] : []),
    ];

    const webQueries = [
      ...(name ? [safeQuery(admin.from("web_orders").select(webSelect).ilike("customer_name", `%${name}%`).order("created_at", { ascending: false }).limit(250), webMapper)] : []),
      ...uniqueValues([phone, email]).map((value) => safeQuery(admin.from("web_orders").select(webSelect).ilike("customer_contact", `%${value}%`).order("created_at", { ascending: false }).limit(250), webMapper)),
      ...(userId ? [safeQuery(admin.from("web_orders").select(webSelect).eq("user_id", userId).order("created_at", { ascending: false }).limit(250), webMapper)] : []),
    ];

    const rows = dedupeRows((await Promise.all([...posQueries, ...webQueries])).flat());
    return Response.json({ rows });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to load purchase history." }, { status: 500 });
  }
}
