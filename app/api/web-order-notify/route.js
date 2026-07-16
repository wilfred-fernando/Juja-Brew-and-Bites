import { escapeEmailHtml, notificationRecipient, sendNotificationEmail } from "@/lib/email/notifications";

function peso(value) {
  return `PHP ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function manilaDateTime(value) {
  if (!value) return "-";
  try {
    const normalizedValue =
      typeof value === "string" && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(value) && !/(Z|[+-]\d{2}:?\d{2})$/.test(value)
        ? `${value.replace(" ", "T")}Z`
        : value;
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).format(new Date(normalizedValue));
  } catch {
    return String(value);
  }
}

function itemRows(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<tr><td colspan="4" style="padding:8px;border-bottom:1px solid #e5e7eb;">No item details supplied.</td></tr>`;
  }

  return items
    .map((item) => {
      const name = item?.name || item?.item_name || item?.product_name || "Item";
      const qty = Number(item?.quantity || 1);
      const unitPrice = Number(item?.unitPrice || item?.unit_price || item?.price || 0);
      const lineTotal = Number(item?.lineTotal || item?.line_total || unitPrice * qty);
      const options = [item?.variant, item?.variantName, item?.optionsText, item?.instructions]
        .filter(Boolean)
        .join(" | ");

      return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeEmailHtml(name)}${options ? `<br><small>${escapeEmailHtml(options)}</small>` : ""}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center;">${escapeEmailHtml(qty)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeEmailHtml(peso(unitPrice))}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeEmailHtml(peso(lineTotal))}</td>
        </tr>
      `;
    })
    .join("");
}

export async function POST(req) {
  try {
    const body = await req.json();
    const order = body?.order || {};
    const storeName = body?.storeName || order.store_name || order.branch_name || order.store_id || "-";
    const recipient = notificationRecipient(
      body?.adminEmail,
      process.env.WEB_ORDER_NOTIFY_EMAIL,
      process.env.ADMIN_NOTIFY_EMAIL
    );

    const subject = `New Web Order Received - ${order.customer_name || "Customer"}`;
    const html = `
      <h2>New Web Order Received</h2>
      <p>A customer order was submitted and is waiting in POS web orders.</p>
      <p><b>Order ID:</b> ${escapeEmailHtml(order.id || "-")}</p>
      <p><b>Customer:</b> ${escapeEmailHtml(order.customer_name || "-")}</p>
      <p><b>Contact:</b> ${escapeEmailHtml(order.customer_contact || "-")}</p>
      <p><b>Store:</b> ${escapeEmailHtml(storeName)}</p>
      <p><b>Dining Option:</b> ${escapeEmailHtml(order.dining_option || order.fulfillment_type || "-")}</p>
      <p><b>Target Time:</b> ${escapeEmailHtml(order.schedule_label || order.fulfillment_time || "-")}</p>
      <p><b>Payment:</b> ${escapeEmailHtml(order.payment_method || "-")} / ${escapeEmailHtml(order.payment_status || "-")}</p>
      ${order.delivery_address ? `<p><b>Delivery Address:</b> ${escapeEmailHtml(order.delivery_address)}</p>` : ""}
      ${order.payment_proof_url ? `<p><b>Payment Proof:</b> <a href="${escapeEmailHtml(order.payment_proof_url)}">${escapeEmailHtml(order.payment_proof_url)}</a></p>` : ""}
      <table style="border-collapse:collapse;width:100%;max-width:760px;margin-top:16px;">
        <thead>
          <tr>
            <th style="padding:8px;border-bottom:2px solid #cbd5e1;text-align:left;">Item</th>
            <th style="padding:8px;border-bottom:2px solid #cbd5e1;text-align:center;">Qty</th>
            <th style="padding:8px;border-bottom:2px solid #cbd5e1;text-align:right;">Price</th>
            <th style="padding:8px;border-bottom:2px solid #cbd5e1;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows(order.items)}</tbody>
      </table>
      <p style="font-size:18px;"><b>Total:</b> ${escapeEmailHtml(peso(order.total || order.subtotal))}</p>
      <p><b>Submitted:</b> ${escapeEmailHtml(manilaDateTime(order.created_at || order.submitted_at || new Date().toISOString()))}</p>
    `;

    const email = await sendNotificationEmail({
      to: recipient,
      subject,
      html,
    });

    if (!email.sent) {
      return Response.json({ sent: false, error: email.error, publicError: email.publicError }, { status: 503 });
    }

    return Response.json({ sent: true });
  } catch (error) {
    return Response.json({ sent: false, error: error?.message || "Server error" }, { status: 500 });
  }
}
