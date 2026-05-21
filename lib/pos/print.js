export function print58(text) {
  const html = `
  <html>
    <body><pre>${text}</pre></body>
  </html>`;

  const frame = document.createElement("iframe");
  frame.style.display = "none";

  frame.onload = () => {
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 500);
  };

  document.body.appendChild(frame);
  frame.contentDocument.write(html);
}

export async function printByRole(role, text, config) {
  const cfg = config?.[role];

  if (!cfg || cfg.transport === "browser") {
    print58(text);
    return;
  }

  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [cfg.ble_service_uuid],
    });

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(cfg.ble_service_uuid);
    const char = await service.getCharacteristic(cfg.ble_characteristic_uuid);

    await char.writeValue(new TextEncoder().encode(text));
  } catch {
    print58(text);
  }
}
