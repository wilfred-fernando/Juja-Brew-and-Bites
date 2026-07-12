import { createClient } from "@supabase/supabase-js";
import { cacheHeaders, getCached } from "@/lib/serverCache";
import { isPromoCategoryName, isPromoMenuItem } from "@/lib/menuPromos";

const MENU_TTL_MS = 30 * 1000;

function getPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment is not configured.");
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function loadMenuData(mode) {
  const supabase = getPublicClient();
  const isCustomer = mode === "customer";

  const itemQuery = supabase
    .from("menu_items")
    .select("*")
    .order("name");

  if (isCustomer) itemQuery.eq("pos_only", false);
  else itemQuery.or("pos_only.is.null,pos_only.eq.false");
  if (!isCustomer) itemQuery.eq("is_available", true);

  const categoryQuery = supabase
    .from("menu_categories")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (isCustomer) categoryQuery.eq("pos_only", false);
  else categoryQuery.or("pos_only.is.null,pos_only.eq.false");

  const promises = isCustomer
    ? [
        itemQuery,
        categoryQuery,
        supabase.from("stores").select("id, name, is_active").eq("is_active", true).order("name"),
        supabase.from("menu_item_store_availability").select("item_id, store_id, is_available"),
        supabase.from("menu_category_store_availability").select("category_id, store_id, is_available"),
        supabase.from("option_group_store_availability").select("store_id, group_key, group_name, is_available"),
        supabase.from("option_selection_store_availability").select("store_id, group_key, option_key, group_name, option_name, is_available"),
      ]
    : [itemQuery, categoryQuery];

  const [itemRes, catRes, storeRes, availabilityRes, categoryAvailabilityRes, optionGroupAvailabilityRes, optionSelectionAvailabilityRes] = await Promise.all(promises);
  const errors = [itemRes.error, catRes.error, storeRes?.error, availabilityRes?.error, categoryAvailabilityRes?.error, optionGroupAvailabilityRes?.error, optionSelectionAvailabilityRes?.error].filter(Boolean);
  if (errors.length) throw errors[0];

  const rawItems = itemRes.data || [];
  const rawCategories = catRes.data || [];
  const items = isCustomer ? rawItems : rawItems.filter((item) => !isPromoMenuItem(item));
  const categories = isCustomer ? rawCategories : rawCategories.filter((cat) => !isPromoCategoryName(cat.name));

  return {
    items,
    categories,
    stores: storeRes?.data || [],
    itemStoreAvailability: availabilityRes?.data || [],
    categoryStoreAvailability: categoryAvailabilityRes?.data || [],
    optionGroupStoreAvailability: optionGroupAvailabilityRes?.data || [],
    optionSelectionStoreAvailability: optionSelectionAvailabilityRes?.data || [],
    generatedAt: new Date().toISOString(),
  };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") === "customer" ? "customer" : "public";
    const data = await getCached(`menu-data:${mode}`, MENU_TTL_MS, () => loadMenuData(mode));

    return Response.json(data, {
      headers: {
        ...cacheHeaders(30, 120),
        "X-Juja-Cache": "menu-data",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error?.message || "Unable to load menu data." },
      { status: 500 }
    );
  }
}
