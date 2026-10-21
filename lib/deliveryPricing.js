export function priceForMenuChannel(entry, channel = "standard") {
  const shared = ["grab", "panda", "shopee", "shopeefood", "foodpanda"].includes(channel);
  const grab = entry?.grab_price;
  return Number(shared && grab !== null && grab !== undefined && grab !== "" ? grab : entry?.price || 0) || 0;
}
