const FOODBOOKING_MENU_LINK = /https?:\/\/(?:www\.)?jujabrewandbites\.com\/menu(?:[/?#][^\s]*)?/gi;

export function stripFoodBookingMenuLinks(value) {
  return String(value || "")
    .replace(FOODBOOKING_MENU_LINK, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isFoodBookingMenuLink(value) {
  FOODBOOKING_MENU_LINK.lastIndex = 0;
  return FOODBOOKING_MENU_LINK.test(String(value || ""));
}

export function sanitizeMessengerReply(message = {}) {
  const attachment = message?.attachment;
  const payload = attachment?.payload;
  const buttons = Array.isArray(payload?.buttons)
    ? payload.buttons.filter((button) => button?.type !== "web_url" || !isFoodBookingMenuLink(button.url))
    : null;
  return {
    ...message,
    ...(message.text ? { text: stripFoodBookingMenuLinks(message.text) } : {}),
    ...(attachment?.type === "template" && payload && buttons ? {
      attachment: { ...attachment, payload: { ...payload, text: stripFoodBookingMenuLinks(payload.text), buttons } },
    } : {}),
  };
}
