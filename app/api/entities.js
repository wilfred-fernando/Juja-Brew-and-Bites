import { createClient } from "@supabase/supabase-js";

// ─── 1. INITIALIZE SUPABASE ONCE ──────────────────────────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const supabase = createClient(supabaseUrl, supabaseKey);


// ─── 2. SCHEMAS ───────────────────────────────────────────────────────────────
export const MenuItemSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    price: { type: "number" },
    category: {
      type: "string",
      enum: [ "Signature", "Cookies", "Pastries", "Coffee", "Non-Coffee", "Frappe", "Milk Tea", "Chicken", "Rice Meal", "Rice in a Box", "Pasta", "Waffles", "Snacks", "All Day Breakfast", "Group Tray" ]
    },
    image_url: { type: "string" },
    is_available: { type: "boolean", default: true },
    is_featured: { type: "boolean", default: false },
    option_groups: {
      type: "array",
      description: "Groups of options customers can choose from (e.g., Size, Flavor, Add-ons)",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          required: { type: "boolean" },
          multi_select: { type: "boolean" },
          max_selection: { type: "number" },
          pos_only: { type: "boolean", default: false },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                price_add: { type: "number", default: 0 }
              }
            }
          }
        }
      }
    }
  },
  required: ["name", "price", "category"],
  name: "MenuItem"
};


// ─── 3. LOYALTY MEMBER ENTITY ─────────────────────────────────────────────────
export const LoyaltyMember = {
  async list() {
    const { data, error } = await supabase.from("loyalty_members").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async getByUserId(userId) {
    const { data, error } = await supabase.from("loyalty_members").select("*").eq("user_id", userId).single();
    if (error && error.code !== 'PGRST116') throw error; 
    return data || null;
  },
  async create(payload) {
    const { data, error } = await supabase.from("loyalty_members").insert([payload]).select();
    if (error) throw error;
    return data[0];
  },
  async update(id, payload) {
    const { id: _, created_at: __, ...safePayload } = payload;
    const { data, error } = await supabase.from("loyalty_members").update(safePayload).eq("id", id).select();
    if (error) throw error;
    return data[0];
  },
  async delete(id) {
    const { error } = await supabase.from("loyalty_members").delete().eq("id", id);
    if (error) throw error;
    return true;
  }
};


// ─── 4. ROOM BOOKING ENTITY ───────────────────────────────────────────────────
export const RoomBooking = {
  async list() {
    const { data, error } = await supabase.from("room_bookings").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async getByUserId(userId) {
    const { data, error } = await supabase.from("room_bookings").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async create(payload) {
    const { data, error } = await supabase.from("room_bookings").insert([payload]).select();
    if (error) throw error;
    return data[0];
  },
  async update(id, payload) {
    const { id: _, created_at: __, ...safePayload } = payload;
    const { data, error } = await supabase.from("room_bookings").update(safePayload).eq("id", id).select();
    if (error) throw error;
    return data[0];
  },
  async delete(id) {
    const { error } = await supabase.from("room_bookings").delete().eq("id", id);
    if (error) throw error;
    return true;
  }
};


// ─── 5. MENU & ORDER ENTITIES (Required for your OrderTab) ────────────────────
export const MenuItem = {
  async list() {
    const { data, error } = await supabase.from("menu_items").select("*").order("name");
    if (error) throw error;
    return data || [];
  }
};

export const MenuCategory = {
  async list() {
    const { data, error } = await supabase.from("menu_categories").select("*").order("sort_order");
    if (error) throw error;
    return data || [];
  }
};

export const Order = {
  async create(payload) {
    const { data, error } = await supabase.from("orders").insert([payload]).select();
    if (error) throw error;
    return data[0];
  }
};
