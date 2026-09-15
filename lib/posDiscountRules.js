const MANILA_TIME_ZONE = "Asia/Manila";

function promotionRulesFor(discount) {
  const value = discount?.promotion_rules ?? discount?.promotionRules;
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value : {};
}

function manilaDateInfo(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const weekday = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[parts.weekday];
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday };
}

export function isPosDiscountRuleCurrentlyActive(discount, now = new Date()) {
  if (!discount || discount.is_active === false) return false;
  const rules = promotionRulesFor(discount);
  if (Object.keys(rules).length === 0) return true;

  const current = manilaDateInfo(now);
  if (rules.valid_from && current.date < String(rules.valid_from)) return false;
  if (rules.valid_until && current.date > String(rules.valid_until)) return false;
  if (Array.isArray(rules.weekdays) && rules.weekdays.length > 0) {
    if (!rules.weekdays.map(Number).includes(current.weekday)) return false;
  }
  return true;
}

export function isRegularDrinkSelection(selectedOptions = []) {
  const optionNames = (Array.isArray(selectedOptions) ? selectedOptions : [])
    .map((option) => String(option?.name || option || "").trim())
    .filter(Boolean);
  return !optionNames.some((name) => /\blarge\b|\(\s*l\s*\)|\b22\s*oz\b/i.test(name));
}

export function posDiscountRuleAppliesToItem(discount, { entitlementGroup, selectedOptions = [], now = new Date() } = {}) {
  if (!isPosDiscountRuleCurrentlyActive(discount, now)) return false;
  const rules = promotionRulesFor(discount);
  const normalizedGroup = String(entitlementGroup || "").trim().toLowerCase();
  if (Array.isArray(rules.entitlement_groups) && rules.entitlement_groups.length > 0) {
    if (!rules.entitlement_groups.map((group) => String(group).toLowerCase()).includes(normalizedGroup)) return false;
  }
  if (rules.regular_size_only === true) {
    return normalizedGroup === "drink" && isRegularDrinkSelection(selectedOptions);
  }
  return true;
}

export function isWholeOrderDiscountRule(discount, now = new Date()) {
  if (!isPosDiscountRuleCurrentlyActive(discount, now)) return false;
  const scope = String(discount?.scope || "receipt").trim().toLowerCase();
  if (!["receipt", "order"].includes(scope)) return false;
  if (discount?.requires_discount_beneficiary === true) return false;

  const name = String(discount?.name || discount?.discount_name || "").toLowerCase();
  if (/\bsc\b|\bpwd\b|\bsenior\b|\bqcid\b|\bqc\s+id\b|\bteacher/.test(name)) return false;

  const rules = promotionRulesFor(discount);
  return !rules.beneficiary_type
    && !rules.daily_limit_per_group
    && !rules.regular_size_only
    && !(Array.isArray(rules.entitlement_groups) && rules.entitlement_groups.length > 0);
}

export function promotionRuleSummary(discount) {
  const rules = promotionRulesFor(discount);
  if (Object.keys(rules).length === 0) return "";
  const dates = rules.valid_from === rules.valid_until
    ? rules.valid_from
    : [rules.valid_from, rules.valid_until].filter(Boolean).join(" to ");
  const schedule = Array.isArray(rules.weekdays) && rules.weekdays.length === 5 ? "Mon-Fri" : "";
  const groups = Array.isArray(rules.entitlement_groups) ? rules.entitlement_groups.join(", ") : "";
  return [dates, schedule, groups, rules.regular_size_only ? "regular size only" : "", rules.daily_limit_per_group ? `limit ${rules.daily_limit_per_group} per category/day` : ""]
    .filter(Boolean)
    .join(" | ");
}

export function discountPromotionRules(discount) {
  return promotionRulesFor(discount);
}
