import { isFcmConfigured, serviceSupabase, sendCustomerOrderStatusPush } from "./customerPush";

export async function drainCustomerOrderPush(webOrderId = null) {
  if (!isFcmConfigured()) throw new Error("FCM credentials are not configured.");
  const admin = serviceSupabase();
  const { data: jobs, error } = await admin.rpc("claim_customer_order_push", { p_order_id: webOrderId });
  if (error) throw error;
  const results = [];
  for (const job of jobs || []) {
    try {
      const result = await sendCustomerOrderStatusPush({ webOrderId: job.web_order_id, status: "delivery_update" });
      if (result.failed) throw new Error(`${result.failed} device deliveries failed.`);
      const { error: deleteError } = await admin.from("customer_order_push_outbox").delete()
        .eq("web_order_id", job.web_order_id).eq("version", job.version);
      if (deleteError) throw deleteError;
      results.push({ webOrderId: job.web_order_id, ...result });
    } catch (error) {
      const { error: retryError } = await admin.from("customer_order_push_outbox").update({
        leased_until: null,
        available_at: new Date(Date.now() + Math.min(60, 2 ** job.attempts) * 60000).toISOString(),
        last_error: String(error.message || "Order push failed").slice(0, 500),
      }).eq("web_order_id", job.web_order_id).eq("version", job.version);
      if (retryError) throw retryError;
      results.push({ webOrderId: job.web_order_id, failed: true });
    }
  }
  return results;
}
