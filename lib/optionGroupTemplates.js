const price = (value, fallback = 0) => value === "" || value == null ? fallback : Number(value);
export function optionTemplateKey(group) {
  const publicVisible = group.show_public ?? (!group.pos_only && !group.hide_public);
  return JSON.stringify({
    name: String(group.name || "").trim(), required: !!group.is_required, multi: !!group.is_multi_select,
    max: group.is_multi_select && group.max_selection ? Number(group.max_selection) : null,
    public: publicVisible, customer: group.show_customer ?? !group.pos_only, pos: group.show_pos ?? true,
    options: (group.options || []).map((option) => ({
      name: option.name, price: price(option.price), grab: price(option.grab_price, price(option.price)),
      available: option.is_available ?? option.isAvailable ?? true,
      extra: Object.fromEntries(Object.entries(option).filter(([key]) => !["id", "name", "price", "grab_price", "panda_price", "isAvailable", "is_available"].includes(key)).sort(([a], [b]) => a.localeCompare(b))),
    })),
  });
}
