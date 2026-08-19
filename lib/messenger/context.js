export const DEFAULT_MESSENGER_AI_SETTINGS = {
  id: 1,
  instructions: "Answer directly and naturally as JujaBot. Use the live databases for customer-facing menu prices, function-room package details, and slot availability. If a requested fact is not in the provided reference, say so and offer the relevant public link or staff assistance.",
  reference_notes: "",
  include_live_menu: true,
  include_function_room: true,
};

const HOUR_MS = 60 * 60 * 1000;
const FUNCTION_ROOM_SLOT_HOURS = [10, 14, 18, 22];
const FUNCTION_ROOM_CONTEXT_DAYS = 60;

function clean(value) {
  return String(value || "").trim();
}

function peso(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "price unavailable";
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function publicOptions(item) {
  return (Array.isArray(item?.variants) ? item.variants : [])
    .filter((group) => !group?.posOnly && !group?.pos_only && !group?.hidePublic && !group?.hide_public && group?.isAvailable !== false && group?.is_available !== false)
    .map((group) => {
      const options = (Array.isArray(group?.options) ? group.options : [])
        .filter((option) => option?.isAvailable !== false && option?.is_available !== false)
        .slice(0, 24)
        .map((option) => `${clean(option?.name)}${Number(option?.price) ? ` +${peso(option.price)}` : ""}`)
        .filter(Boolean);
      return options.length ? `${clean(group?.name) || "Options"}: ${options.join(", ")}` : "";
    })
    .filter(Boolean);
}

function menuLine(item) {
  const name = clean(item?.name);
  if (!name) return "";
  const category = clean(item?.category) || "Other";
  const price = item?.is_variable_price ? "variable price" : peso(item?.price);
  const description = clean(item?.description).replace(/\s+/g, " ").slice(0, 180);
  const options = publicOptions(item);
  return `[${category}] ${name} — ${price}${description ? ` — ${description}` : ""}${options.length ? ` — ${options.join(" | ")}` : ""}`;
}

function menuSummaryLine(item) {
  const name = clean(item?.name);
  if (!name) return "";
  const category = clean(item?.category) || "Other";
  const price = item?.is_variable_price ? "variable price" : peso(item?.price);
  return `[${category}] ${name} — ${price}`;
}

function compactLines(lines, maxCharacters) {
  const accepted = [];
  let length = 0;
  for (const line of lines) {
    if (!line || length + line.length + 1 > maxCharacters) break;
    accepted.push(line);
    length += line.length + 1;
  }
  return accepted.join("\n");
}

function searchableText(item) {
  const options = publicOptions(item).join(" ");
  return `${clean(item?.name)} ${clean(item?.category)} ${clean(item?.description)} ${options}`.toLowerCase();
}

function relevantMenuItems(items, query) {
  const terms = clean(query).toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length >= 2);
  if (!terms.length) return [];
  return (items || [])
    .map((item) => {
      const haystack = searchableText(item);
      const name = clean(item?.name).toLowerCase();
      const score = terms.reduce((total, term) => total + (name.includes(term) ? 5 : haystack.includes(term) ? 1 : 0), 0);
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || clean(a.item?.name).localeCompare(clean(b.item?.name)))
    .slice(0, 16)
    .map((entry) => entry.item);
}

function compactMenuReference(items, query) {
  const summary = compactLines((items || []).map(menuSummaryLine), 12000);
  const detailed = compactLines(relevantMenuItems(items, query).map(menuLine), 6000);
  return [
    summary ? `COMPLETE PUBLIC ITEM AND BASE-PRICE INDEX:\n${summary}` : "",
    detailed ? `QUERY-RELEVANT ITEM DETAILS AND OPTION PRICES:\n${detailed}` : "",
  ].filter(Boolean).join("\n\n");
}

function functionRoomPackageLine(pkg) {
  const details = [
    `${clean(pkg?.name) || `Package ${pkg?.id}`} — capacity ${Number(pkg?.capacity) || "unavailable"} guests — ${peso(pkg?.rental_fee)} for the standard 3-hour slot`,
    pkg?.included_food_value == null ? "room-only package; no included food value" : `${peso(pkg.included_food_value)} included food and drinks value`,
    clean(pkg?.inclusions) ? `inclusions: ${clean(pkg.inclusions)}` : "",
    Number(pkg?.extension_max_hours) ? `up to ${Number(pkg.extension_max_hours)} extension hour(s)` : "",
    clean(pkg?.extension_option1),
    clean(pkg?.extension_option2),
  ].filter(Boolean);
  return details.join(" | ");
}

function manilaDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function addCalendarDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function isoCalendarDate(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function manilaSlotInstant(parts, hour) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + (hour >= 24 ? 1 : 0), (hour % 24) - 8));
}

function slotLabel(hour) {
  const label = (value) => `${((value % 24) + 11) % 12 + 1}${value % 24 >= 12 ? "PM" : "AM"}`;
  return `${label(hour)}-${label(hour + 3)}`;
}

function bookingBlocksSlot(booking, now) {
  const status = clean(booking?.status).toLowerCase();
  if (!["pending", "confirmed", "cancellation_requested"].includes(status)) return false;
  if (status !== "pending") return true;
  const waiting = clean(booking?.payment_status).toLowerCase() === "waiting_for_payment";
  const createdAt = new Date(booking?.created_at || 0);
  const staleUnpaidHold = waiting && !booking?.payment_proof_url && Number.isFinite(createdAt.getTime()) && now.getTime() - createdAt.getTime() >= 24 * HOUR_MS;
  return !staleUnpaidHold;
}

function functionRoomAvailabilityReference(bookings, now = new Date()) {
  const blockers = (bookings || []).filter((booking) => bookingBlocksSlot(booking, now));
  const today = manilaDateParts(now);
  const minimumStart = new Date(now.getTime() + 3 * HOUR_MS);
  const lines = [];
  for (let offset = 0; offset < FUNCTION_ROOM_CONTEXT_DAYS; offset += 1) {
    const date = addCalendarDays(today, offset);
    const available = FUNCTION_ROOM_SLOT_HOURS.filter((hour) => {
      const slotStart = manilaSlotInstant(date, hour);
      const slotEnd = new Date(slotStart.getTime() + 3 * HOUR_MS);
      if (slotStart < minimumStart) return false;
      return !blockers.some((booking) => {
        const bookingStart = new Date(booking.start_at);
        const bookingEnd = new Date(booking.end_at);
        return slotStart < new Date(bookingEnd.getTime() + HOUR_MS) && slotEnd > new Date(bookingStart.getTime() - HOUR_MS);
      });
    }).map(slotLabel);
    lines.push(`${isoCalendarDate(date)}: ${available.length ? available.join(", ") : "no available fixed slots"}`);
  }
  return { text: lines.join("\n"), blockerCount: blockers.length };
}

async function loadFunctionRoomReference(admin) {
  const now = new Date();
  const horizon = new Date(now.getTime() + (FUNCTION_ROOM_CONTEXT_DAYS + 2) * 24 * HOUR_MS);
  const [packagesResult, bookingsResult] = await Promise.all([
    admin.from("function_room_packages").select("id, name, capacity, rental_fee, included_food_value, extension_max_hours, extension_option1, extension_option2, inclusions, is_active").eq("is_active", true).order("id"),
    admin.from("function_room_bookings").select("start_at, end_at, status, payment_status, payment_proof_url, created_at").in("status", ["pending", "confirmed", "cancellation_requested"]).gte("end_at", new Date(now.getTime() - HOUR_MS).toISOString()).lte("start_at", horizon.toISOString()).order("start_at").limit(250),
  ]);
  if (packagesResult.error) throw packagesResult.error;
  if (bookingsResult.error) throw bookingsResult.error;
  const packages = packagesResult.data || [];
  const availability = functionRoomAvailabilityReference(bookingsResult.data || [], now);
  return {
    packageCount: packages.length,
    blockerCount: availability.blockerCount,
    text: [
      `ACTIVE PACKAGES:\n${packages.map(functionRoomPackageLine).join("\n")}`,
      `LIVE FIXED-SLOT AVAILABILITY FOR THE NEXT ${FUNCTION_ROOM_CONTEXT_DAYS} DAYS (Asia/Manila; generated ${now.toISOString()}):\n${availability.text}`,
    ].join("\n\n"),
  };
}

function settingsMissing(error) {
  return ["42P01", "PGRST205"].includes(clean(error?.code).toUpperCase());
}

export async function loadMessengerAiContext(admin, { query = "" } = {}) {
  const settingsResult = await admin.from("messenger_ai_settings").select("*").eq("id", 1).maybeSingle();
  if (settingsResult.error && !settingsMissing(settingsResult.error)) throw settingsResult.error;
  const settings = { ...DEFAULT_MESSENGER_AI_SETTINGS, ...(settingsResult.data || {}) };

  let menuReference = "";
  let menuItemCount = 0;
  if (settings.include_live_menu) {
    const { data, error } = await admin
      .from("menu_items")
      .select("name, description, price, category, is_available, is_variable_price, pos_only, variants")
      .eq("is_available", true)
      .or("pos_only.is.null,pos_only.eq.false")
      .order("category")
      .order("name")
      .limit(250);
    if (error) throw error;
    menuItemCount = (data || []).length;
    menuReference = compactMenuReference(data || [], query);
  }

  let functionRoomReference = "";
  let functionRoomPackageCount = 0;
  let functionRoomBlockedBookingCount = 0;
  if (settings.include_function_room) {
    const reference = await loadFunctionRoomReference(admin);
    functionRoomReference = reference.text;
    functionRoomPackageCount = reference.packageCount;
    functionRoomBlockedBookingCount = reference.blockerCount;
  }

  const sections = [
    clean(settings.instructions) ? `ADMIN INSTRUCTIONS:\n${clean(settings.instructions)}` : "",
    clean(settings.reference_notes) ? `ADMIN REFERENCE NOTES:\n${clean(settings.reference_notes)}` : "",
    menuReference ? `LIVE MENU DATABASE REFERENCE (authoritative for public menu names, descriptions, and base/option prices):\n${menuReference}` : "",
    menuReference ? "Use only the live menu reference for specific menu prices. If an item is absent, do not invent it; share https://www.jujabrewandbites.com/menu." : "",
    functionRoomReference ? `LIVE FUNCTION-ROOM DATABASE REFERENCE (authoritative for active package details and current slot availability):\n${functionRoomReference}` : "",
    functionRoomReference ? "Availability is a live snapshot and can change before checkout. Never claim a reservation is confirmed. For dates outside the reference window or to reserve a slot, share https://www.jujabrewandbites.com/function-room." : "",
  ].filter(Boolean);

  return {
    settings,
    instructions: sections.join("\n\n"),
    menuItemCount,
    functionRoomPackageCount,
    functionRoomBlockedBookingCount,
  };
}
