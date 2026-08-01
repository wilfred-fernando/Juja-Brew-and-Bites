/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, name, rawValue] = match;
    if (!process.env[name]) process.env[name] = rawValue.replace(/^["']|["']$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing Supabase environment variables.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const MANILA_START = "2026-06-29T00:00:00+08:00";
const START_ISO = new Date(MANILA_START).toISOString();
const POINT_RATE = 0.04;
const ACTIVE_ORDER_STATUSES = new Set(["paid", "closed", "completed", "complete", "delivered", "ready"]);
const REFUND_STATUSES = new Set(["refunded", "voided", "cancelled", "canceled"]);

function numberValue(value) {
  return Number(value || 0) || 0;
}

function round2(value) {
  return Number(numberValue(value).toFixed(2));
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function isPromoCategoryName(categoryName) {
  const normalized = normalizeText(categoryName);
  return ["promo", "promos", "promotion", "promotions"].includes(normalized);
}

function hasAppliedVoucher(voucher) {
  return Boolean(voucher && typeof voucher === "object" && (
    voucher.id || voucher.code || voucher.reward_text || voucher.reward_type || voucher.title
  ));
}

function lineNetAmount(line) {
  const explicitTotal = line?.net_amount ?? line?.line_total ?? line?.lineTotal ?? line?.total ?? line?.subtotal;
  if (explicitTotal !== undefined && explicitTotal !== null && explicitTotal !== "") {
    return numberValue(explicitTotal);
  }
  const unitPrice = line?.price ?? line?.unit_price ?? line?.unitPrice ?? line?.basePrice ?? line?.selectedPrice;
  const gross = numberValue(unitPrice) * numberValue(line?.quantity || line?.qty || 1);
  return Math.max(gross - numberValue(line?.discount_amount ?? line?.discountAmount), 0);
}

function lineEligibleAmount(line) {
  const category = line?.category_name || line?.categoryName || line?.category || "";
  if (isPromoCategoryName(category)) return 0;
  if (hasAppliedVoucher(line?.appliedVoucher || line?.applied_voucher)) return 0;
  return lineNetAmount(line);
}

function expectedPointsForOrder(order, items = []) {
  const sourceItems = Array.isArray(order.items) && order.items.length > 0 ? order.items : items;
  const orderTotal = numberValue(order.net_amount ?? order.total);
  const hasDetectableNonEarningLine = sourceItems.some((item) => {
    const category = item?.category_name || item?.categoryName || item?.category || "";
    return isPromoCategoryName(category) || hasAppliedVoucher(item?.appliedVoucher || item?.applied_voucher);
  });
  const computedEligible = sourceItems.reduce((sum, item) => sum + lineEligibleAmount(item), 0);
  const eligible = hasDetectableNonEarningLine ? computedEligible : orderTotal;
  return {
    eligibleTotal: round2(eligible),
    points: round2(eligible * POINT_RATE),
  };
}

async function fetchAll(builder, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await builder().range(from, to);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function chunk(values, size = 100) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function main() {
  console.error("Loading orders...");
  const orders = await fetchAll(() => supabase
    .from("orders")
    .select("id,receipt_number,source_web_order_id,created_at,paid_at,status,customer_name,customer_id,loyalty_member_id,user_id,total,net_amount,payment_method,dining_option,loyalty_points_awarded,loyalty_points_awarded_at,items")
    .gte("created_at", START_ISO)
    .order("created_at", { ascending: true }));
  console.error(`Loaded ${orders.length} orders.`);

  console.error("Loading web orders...");
  const webOrders = await fetchAll(() => supabase
    .from("web_orders")
    .select("*")
    .gte("created_at", START_ISO)
    .order("created_at", { ascending: true }));
  console.error(`Loaded ${webOrders.length} web orders.`);

  const orderIds = orders.map((order) => order.id).filter(Boolean);
  console.error("Loading order items...");
  const orderItems = [];
  for (const ids of chunk(orderIds, 100)) {
    orderItems.push(...await fetchAll(() => supabase
      .from("order_items")
      .select("order_id,name,category_name,quantity,unit_price,line_total,gross_amount,discount_amount,net_amount")
      .in("order_id", ids)));
  }
  console.error(`Loaded ${orderItems.length} order items.`);

  const itemsByOrder = new Map();
  for (const item of orderItems) {
    const key = String(item.order_id);
    if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
    itemsByOrder.get(key).push(item);
  }

  console.error("Loading loyalty members...");
  const members = await fetchAll(() => supabase
    .from("loyalty_members")
    .select('id,user_id,customer_name,customer_code,"Phone","Available points","Points balance","Total spent","Total visits","First visit","Last visit"'));
  console.error(`Loaded ${members.length} loyalty members.`);
  const memberById = new Map(members.map((member) => [String(member.id), member]));
  const memberByUserId = new Map(members.filter((member) => member.user_id).map((member) => [String(member.user_id), member]));
  const membersByName = new Map();
  for (const member of members) {
    const key = normalizeText(member.customer_name);
    if (!key) continue;
    if (!membersByName.has(key)) membersByName.set(key, []);
    membersByName.get(key).push(member);
  }

  function resolveMember(row) {
    const explicitId = row.loyalty_member_id || row.customer_id;
    if (explicitId && memberById.has(String(explicitId))) {
      return { member: memberById.get(String(explicitId)), match: "explicit_id" };
    }
    if (row.user_id && memberByUserId.has(String(row.user_id))) {
      return { member: memberByUserId.get(String(row.user_id)), match: "user_id" };
    }
    const nameMatches = membersByName.get(normalizeText(row.customer_name)) || [];
    if (nameMatches.length === 1) return { member: nameMatches[0], match: "unique_name" };
    return { member: null, match: nameMatches.length > 1 ? "ambiguous_name" : "unmatched" };
  }

  const orderByWebId = new Map();
  const orderByReceipt = new Map();
  for (const order of orders) {
    if (order.source_web_order_id) orderByWebId.set(String(order.source_web_order_id), order);
    if (order.receipt_number) orderByReceipt.set(String(order.receipt_number).toLowerCase(), order);
  }

  const ledger = [];
  const duplicates = [];
  const unresolvedNamedOrders = [];

  for (const order of orders) {
    const status = normalizeText(order.status);
    if (!ACTIVE_ORDER_STATUSES.has(status) || REFUND_STATUSES.has(status)) continue;
    const resolution = resolveMember(order);
    const memberId = resolution.member?.id;
    if (!memberId) {
      if (normalizeText(order.customer_name) && normalizeText(order.customer_name) !== "walk-in") {
        unresolvedNamedOrders.push({ source: "orders", receipt: order.receipt_number, customer: order.customer_name, date: order.paid_at || order.created_at, total: round2(order.net_amount ?? order.total), reason: resolution.match });
      }
      continue;
    }
    const { eligibleTotal, points } = expectedPointsForOrder(order, itemsByOrder.get(String(order.id)) || []);
    ledger.push({
      source: "orders",
      orderId: order.id,
      receipt: order.receipt_number || "",
      date: order.paid_at || order.created_at,
      memberId: String(memberId),
      memberName: memberById.get(String(memberId))?.customer_name || order.customer_name || "",
      customerCode: memberById.get(String(memberId))?.customer_code || "",
      status: order.status,
      payment: order.payment_method || "",
      dining: order.dining_option || "",
      total: round2(order.net_amount ?? order.total),
      eligibleTotal,
      expectedPoints: points,
      storedAwarded: round2(order.loyalty_points_awarded),
      awardedAt: order.loyalty_points_awarded_at || "",
      memberMatch: resolution.match,
    });
  }

  for (const webOrder of webOrders) {
    const matchingOrder = (webOrder.id && orderByWebId.get(String(webOrder.id))) ||
      (webOrder.receipt_number && orderByReceipt.get(String(webOrder.receipt_number).toLowerCase()));
    if (matchingOrder) {
      duplicates.push({
        webOrderId: webOrder.id,
        receipt: webOrder.receipt_number || matchingOrder.receipt_number || "",
        webStatus: webOrder.status || webOrder.order_status || "",
        posOrderId: matchingOrder.id,
        posStatus: matchingOrder.status || "",
        customer: webOrder.customer_name || matchingOrder.customer_name || "",
        total: round2(webOrder.total || matchingOrder.total),
      });
      continue;
    }

    const status = normalizeText(webOrder.status || webOrder.order_status);
    if (!ACTIVE_ORDER_STATUSES.has(status) || REFUND_STATUSES.has(status)) continue;
    const resolution = resolveMember(webOrder);
    const memberId = resolution.member?.id;
    if (!memberId) {
      if (normalizeText(webOrder.customer_name) && normalizeText(webOrder.customer_name) !== "walk-in") {
        unresolvedNamedOrders.push({ source: "web_orders", receipt: webOrder.receipt_number, customer: webOrder.customer_name, date: webOrder.completed_at || webOrder.created_at, total: round2(webOrder.total || webOrder.subtotal), reason: resolution.match });
      }
      continue;
    }
    const { eligibleTotal, points } = expectedPointsForOrder(webOrder, []);
    ledger.push({
      source: "web_orders",
      orderId: webOrder.id,
      receipt: webOrder.receipt_number || `WEB-${String(webOrder.id).slice(0, 8).toUpperCase()}`,
      date: webOrder.completed_at || webOrder.created_at,
      memberId: String(memberId),
      memberName: memberById.get(String(memberId))?.customer_name || webOrder.customer_name || "",
      customerCode: memberById.get(String(memberId))?.customer_code || "",
      status: webOrder.status || webOrder.order_status,
      payment: webOrder.payment_method || "",
      dining: webOrder.dining_option || webOrder.fulfillment_type || "",
      total: round2(webOrder.total || webOrder.subtotal),
      eligibleTotal,
      expectedPoints: points,
      storedAwarded: round2(webOrder.loyalty_points_awarded),
      awardedAt: webOrder.loyalty_points_awarded_at || "",
      memberMatch: resolution.match,
    });
  }

  const missingOrWrongAwards = ledger
    .filter((row) => Math.abs(row.expectedPoints - row.storedAwarded) >= 0.01)
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

  const expectedByMember = new Map();
  for (const row of ledger) {
    const current = expectedByMember.get(row.memberId) || {
      memberId: row.memberId,
      memberName: row.memberName,
      customerCode: row.customerCode,
      expectedPoints: 0,
      storedAwarded: 0,
      expectedSpent: 0,
      transactions: 0,
    };
    current.expectedPoints = round2(current.expectedPoints + row.expectedPoints);
    current.storedAwarded = round2(current.storedAwarded + row.storedAwarded);
    current.expectedSpent = round2(current.expectedSpent + row.total);
    current.transactions += 1;
    expectedByMember.set(row.memberId, current);
  }

  const memberSummaries = Array.from(expectedByMember.values())
    .map((summary) => {
      const member = memberById.get(summary.memberId) || {};
      return {
        ...summary,
        currentPointsBalance: round2(member["Points balance"]),
        currentAvailablePoints: round2(member["Available points"]),
        currentTotalSpent: round2(member["Total spent"]),
        currentVisits: numberValue(member["Total visits"]),
        orderAwardDifference: round2(summary.expectedPoints - summary.storedAwarded),
      };
    })
    .filter((summary) => Math.abs(summary.orderAwardDifference) >= 0.01)
    .sort((a, b) => Math.abs(b.orderAwardDifference) - Math.abs(a.orderAwardDifference));

  const report = {
    range: {
      startManila: MANILA_START,
      startIso: START_ISO,
      generatedAt: new Date().toISOString(),
    },
    counts: {
      orders: orders.length,
      webOrders: webOrders.length,
      auditedTransactions: ledger.length,
      duplicateWebOrderPairs: duplicates.length,
      missingOrWrongAwards: missingOrWrongAwards.length,
      affectedMembers: memberSummaries.length,
      unresolvedNamedOrders: unresolvedNamedOrders.length,
    },
    duplicateWebOrderPairs: duplicates,
    missingOrWrongAwards,
    affectedMembers: memberSummaries,
    unresolvedNamedOrders,
  };

  const outputPath = path.join(process.cwd(), "tmp", "loyalty_audit_june29_result.json");
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    outputPath,
    range: report.range,
    counts: report.counts,
    duplicateWebOrderPairs: duplicates.map((row) => ({
      receipt: row.receipt,
      customer: row.customer,
      total: row.webTotal,
      webStatus: row.webStatus,
      orderStatus: row.orderStatus,
    })),
    missingOrWrongAwards: missingOrWrongAwards.map((row) => ({
      source: row.source,
      receipt: row.receipt,
      customer: row.memberName,
      date: row.date,
      total: row.total,
      eligibleTotal: row.eligibleTotal,
      expectedPoints: row.expectedPoints,
      storedAwarded: row.storedAwarded,
      difference: round2(row.expectedPoints - row.storedAwarded),
    })),
    affectedMembers: memberSummaries.map((row) => ({
      customer: row.memberName,
      code: row.customerCode,
      transactions: row.transactions,
      expectedPoints: row.expectedPoints,
      storedAwarded: row.storedAwarded,
      difference: row.orderAwardDifference,
      currentAvailablePoints: row.currentAvailablePoints,
      currentPointsBalance: row.currentPointsBalance,
    })),
    unresolvedNamedOrders,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
