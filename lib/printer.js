import qz from "qz-tray";

// -----------------------------
// INIT CONNECTION
// -----------------------------
export async function connectPrinter() {
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect();
  }
}

// -----------------------------
// FIND PRINTER
// -----------------------------
export async function getPrinter() {
  const printers = await qz.printers.find();
  return printers[0]; // default printer
}

// -----------------------------
// FORMAT RECEIPT
// -----------------------------
export function formatReceipt(order) {
  let lines = [];

  lines.push("JUJA BREW & BITES");
  lines.push("------------------------");
  lines.push(`Order ID: ${order.id.slice(-6)}`);
  lines.push(`Date: ${new Date(order.created_at).toLocaleString()}`);
  lines.push("------------------------");

  order.items.forEach((item) => {
    lines.push(`${item.name}`);
    lines.push(`  x${item.qty}  ₱${item.price}`);
  });

  lines.push("------------------------");
  lines.push(`TOTAL: ₱${order.total}`);
  lines.push("------------------------");
  lines.push("Thank you!");
  lines.push("\n\n\n");

  return lines;
}

// -----------------------------
// PRINT RECEIPT
// -----------------------------
export async function printReceipt(order) {
  try {
    await connectPrinter();

    const printer = await getPrinter();

    const config = qz.configs.create(printer);

    const data = [
      {
        type: "raw",
        format: "plain",
        data: formatReceipt(order).join("\n"),
      },
    ];

    await qz.print(config, data);
  } catch (err) {
    console.error("Print error:", err);
    alert("Printer error. Check QZ Tray.");
  }
}