// Shared by realtime notifications and server push. Progress marks stages, not minutes.
export function orderProgressData(order) {
  const status = String(order.status || "pending").toLowerCase();
  const delivery = String(order.delivery_status || "").toLowerCase();
  const cancelled = ["cancelled", "canceled", "rejected"].includes(status);
  const completed = ["completed", "delivered"].includes(status) || delivery === "delivered";
  const onRoute = ["picked_up", "in_transit", "out_for_delivery", "on_delivery", "delivering"].includes(delivery);
  const ready = status === "ready";
  const preparing = ["accepted", "preparing"].includes(status);
  const stage = cancelled ? 0 : completed ? 4 : onRoute ? 3 : ready ? 2 : preparing ? 1 : 0;
  const label = cancelled ? "Order cancelled" : completed ? "Completed" : onRoute ? "Out for delivery" : ready ? "Ready" : preparing ? "Preparing" : "Received";
  return {
    type: "order_status",
    trackable: String(["pending", "accepted", "preparing", "ready", "completed", "delivered", "cancelled", "canceled", "rejected"].includes(status)),
    web_order_id: String(order.id),
    order_label: `Order #${String(order.receipt_number || order.order_number || order.id).slice(0, 8).toUpperCase()}`,
    status,
    delivery_status: delivery,
    progress: String(stage),
    progress_label: label,
    terminal: String(cancelled || completed),
    alert: String(ready || onRoute || cancelled || completed),
    updated_at: String(order.updated_at || order.created_at || ""),
    url: "/customer?tab=history",
    tag: `web-order:${order.id}`,
  };
}

export function orderFcmMessage({ token, title, body, data, progressSupported }) {
  // Only upgraded Android clients receive data-only messages: their native service
  // builds the card even when the WebView is not running. Old APKs retain FCM UI.
  const nativeProgress = progressSupported && data.type === "order_status";
  return {
    token,
    ...(!nativeProgress ? { notification: { title, body } } : {}),
    data: { ...data, title, body, ...(nativeProgress ? { order_progress: "1" } : {}) },
    android: {
      priority: "HIGH",
      ttl: "3600s",
      ...(!nativeProgress ? { notification: {
        channel_id: "customer-orders-audible",
        icon: "ic_stat_juja_notification",
        sound: "notification",
        tag: data.tag || data.web_order_id || "customer-order",
        color: "#087830",
        click_action: "OPEN_CUSTOMER_ORDER_STATUS",
      } } : {}),
    },
    webpush: { notification: { icon: "/favicon.ico", badge: "/favicon.ico" } },
  };
}
