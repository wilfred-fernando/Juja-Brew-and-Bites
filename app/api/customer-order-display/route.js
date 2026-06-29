import { createClient } from "@supabase/supabase-js";
import { cacheHeaders, getCached } from "@/lib/serverCache";

const ACTIVE_STATUSES = ["pending", "scheduled", "accepted", "preparing", "ready"];
const DISPLAY_STATUSES = [...ACTIVE_STATUSES, "completed"];
const SERVED_VISIBLE_MS = 60 * 1000;
const KITCHEN_RULES_TTL_MS = 5 * 60 * 1000;
const PASONG_TAMO_STORE_TTL_MS = 10 * 60 * 1000;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment is not configured.");
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function ticketTime(ticket) {
  return ticket?.completed_at || ticket?.ready_at || ticket?.started_at || ticket?.created_at || ticket?.source_created_at || "";
}

function getItemCategoryMeta(item, itemLookup) {
  const lookup = itemLookup[String(item?.menuItemId || item?.menu_item_id || item?.id || "")] || {};
  return {
    categoryId: item?.categoryId || item?.category_id || item?.menu_category_id || lookup.categoryId || null,
    categoryName: item?.category || item?.categoryName || item?.category_name || lookup.categoryName || null,
  };
}

function getKitchenRule(storeId, rules) {
  const key = String(storeId || "");
  return rules[key] || rules.__global || { ids: new Set(), names: new Set(), configured: false };
}

function isKitchenItem(ticket, item, rules, itemLookup) {
  const rule = getKitchenRule(ticket?.store_id, rules);
  if (!rule.configured) return false;
  const meta = getItemCategoryMeta(item, itemLookup);
  return Boolean(
    (meta.categoryId && rule.ids.has(String(meta.categoryId))) ||
      (meta.categoryName && rule.names.has(normalizeText(meta.categoryName)))
  );
}

function isVoidedItem(item) {
  const status = normalizeText(item?.status || item?.item_status);
  return Boolean(
    item?.voided ||
      item?.isVoided ||
      item?.is_voided ||
      item?.voided_at ||
      item?.voidedAt ||
      status.includes("void") ||
      status.includes("refund")
  );
}

function itemQuantity(item) {
  const qty = Number(item?.quantity || item?.qty || 1);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

async function loadKitchenRulesUncached(supabase) {
  const [groupsRes, mapRes, categoriesRes, itemsRes] = await Promise.all([
    supabase
      .from("pos_printer_groups")
      .select("id, store_id, name, is_active")
      .ilike("name", "%Kitchen%")
      .eq("is_active", true),
    supabase.from("pos_printer_group_categories").select("printer_group_id, store_id, menu_category_id"),
    supabase.from("menu_categories").select("id, name"),
    supabase.from("menu_items").select("id, category"),
  ]);

  if (groupsRes.error) throw groupsRes.error;
  if (mapRes.error) throw mapRes.error;
  if (categoriesRes.error) throw categoriesRes.error;
  if (itemsRes.error) throw itemsRes.error;

  const categoryById = new Map((categoriesRes.data || []).map((cat) => [String(cat.id), cat]));
  const kitchenGroupIds = new Set((groupsRes.data || []).map((group) => String(group.id)));
  const rules = {};

  (mapRes.data || [])
    .filter((row) => kitchenGroupIds.has(String(row.printer_group_id)))
    .forEach((row) => {
      const storeKey = String(row.store_id || "__global");
      const categoryId = String(row.menu_category_id || "");
      const category = categoryById.get(categoryId);
      if (!rules[storeKey]) rules[storeKey] = { ids: new Set(), names: new Set(), configured: true };
      if (categoryId) rules[storeKey].ids.add(categoryId);
      if (category?.name) rules[storeKey].names.add(normalizeText(category.name));
    });

  const itemLookup = {};
  (itemsRes.data || []).forEach((item) => {
    itemLookup[String(item.id)] = {
      categoryId: null,
      categoryName: item.category || null,
    };
  });

  return { rules, itemLookup };
}

async function loadKitchenRules(supabase) {
  return getCached("customer-order-display:kitchen-rules", KITCHEN_RULES_TTL_MS, () => loadKitchenRulesUncached(supabase));
}

async function loadPasongTamoStoreIdsUncached(supabase) {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name")
    .ilike("name", "%Pasong%");
  if (error) throw error;
  return (data || [])
    .filter((store) => normalizeText(store.name).includes("pasong"))
    .map((store) => String(store.id));
}

async function loadPasongTamoStoreIds(supabase) {
  return getCached(
    "customer-order-display:pasong-tamo-store-ids",
    PASONG_TAMO_STORE_TTL_MS,
    () => loadPasongTamoStoreIdsUncached(supabase)
  );
}

export async function GET() {
  try {
    const supabase = getAdminClient();
    const [pasongTamoStoreIds, kitchen] = await Promise.all([
      loadPasongTamoStoreIds(supabase),
      loadKitchenRules(supabase),
    ]);

    if (pasongTamoStoreIds.length === 0) {
      return Response.json(
        { orders: [], generated_at: new Date().toISOString(), branch: "Pasong Tamo" },
        {
          headers: {
            ...cacheHeaders(3, 9),
            "X-Juja-Cache": "customer-order-display",
          },
        }
      );
    }

    const { data: tickets, error: ticketError } = await supabase
      .from("kds_tickets")
      .select("id, status, store_id, dining_option, ticket_number, customer_name, items, created_at, started_at, ready_at, completed_at, source_created_at")
      .in("status", DISPLAY_STATUSES)
      .in("store_id", pasongTamoStoreIds)
      .order("created_at", { ascending: false })
      .limit(120);

    if (ticketError) throw ticketError;

    const now = Date.now();
    const orders = (tickets || [])
      .map((ticket) => {
        const status = normalizeText(ticket.status);
        const completedAt = ticket.completed_at ? new Date(ticket.completed_at).getTime() : 0;
        if (status === "completed" && (!Number.isFinite(completedAt) || now - completedAt > SERVED_VISIBLE_MS)) return null;

        const kitchenItems = (Array.isArray(ticket.items) ? ticket.items : []).filter((item) => isKitchenItem(ticket, item, kitchen.rules, kitchen.itemLookup));
        const activeItems = kitchenItems.filter((item) => !isVoidedItem(item));
        const itemCount = activeItems.reduce((sum, item) => sum + itemQuantity(item), 0);
        if (itemCount <= 0) return null;

        return {
          id: ticket.id,
          dining_option: ticket.dining_option || ticket.ticket_number || "Order",
          item_count: itemCount,
          status: status === "completed" ? "served" : "preparing",
          updated_at: ticketTime(ticket),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "served" ? -1 : 1;
        return new Date(a.updated_at || 0).getTime() - new Date(b.updated_at || 0).getTime();
      });

    return Response.json(
      { orders, generated_at: new Date().toISOString(), branch: "Pasong Tamo" },
      {
        headers: {
          ...cacheHeaders(3, 9),
          "X-Juja-Cache": "customer-order-display",
        },
      }
    );
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to load customer order display." }, { status: 500 });
  }
}
