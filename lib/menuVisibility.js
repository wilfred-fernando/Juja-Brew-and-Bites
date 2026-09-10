export const isMenuItemVisibleToCustomers = (item) =>
  item?.pos_only !== true
  && item?.posOnly !== true
  && item?.is_available !== false
  && item?.available !== false;

export const isMenuCategoryVisibleToCustomers = (category) =>
  category?.pos_only !== true
  && category?.posOnly !== true
  && category?.is_active !== false;
