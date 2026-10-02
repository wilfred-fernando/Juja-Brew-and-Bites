export const isMenuVisibleOn = (entry, channel) => {
  if (typeof entry?.[`show_${channel}`] === "boolean") return entry[`show_${channel}`];
  return channel === "pos" || (entry?.pos_only !== true && entry?.posOnly !== true);
};
export const isMenuItemVisibleToCustomers = (item) => isMenuVisibleOn(item, "customer");
export const isMenuCategoryVisibleToCustomers = (category) => isMenuVisibleOn(category, "customer") && category?.is_active !== false;
export const isMenuItemVisibleToPublic = (item) => isMenuVisibleOn(item, "public");

export const isOptionGroupVisibleOn = (group, channel) => isMenuVisibleOn(group, channel)
  && (channel !== "public" || typeof group?.show_public === "boolean" || (!group?.hidePublic && !group?.hide_public))
  && group?.isAvailable !== false && group?.is_available !== false;
