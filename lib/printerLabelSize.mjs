export const STICKER_SIZES = [
  { key: '40x30', width: 40, height: 30 },
  { key: '50x30', width: 50, height: 30 },
  { key: '50x40', width: 50, height: 40 },
  { key: '53x40', width: 53, height: 40 },
];

export function getCupLabelSize(config = {}, kind = 'niimbot') {
  const clabel = kind === 'ct221b';
  const selected = STICKER_SIZES.find(size => size.key === config.label_size && (clabel || size.width <= 50))
    || STICKER_SIZES.find(size => size.key === (clabel ? '53x40' : '50x40'));
  const dpi = clabel ? 203.2 : 300;
  return { key: selected.key, label: `${selected.width} × ${selected.height} mm`, code: `T${selected.width}*${selected.height}`,
    w_mm: selected.width, h_mm: selected.height, w_px: Math.round(selected.width * dpi / 25.4),
    h_px: Math.round(selected.height * dpi / 25.4), dpi, margin: 10 };
}

export function resizeLabelCanvas(source, size) {
  if (source.width === size.w_px && source.height === size.h_px) return source;
  const canvas = document.createElement('canvas');
  canvas.width = size.w_px;
  canvas.height = size.h_px;
  canvas.style.width = `${size.w_mm}mm`;
  canvas.style.height = `${size.h_mm}mm`;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to resize sticker image.');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / source.width, canvas.height / source.height);
  const width = source.width * scale, height = source.height * scale;
  ctx.drawImage(source, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  return canvas;
}

export function printerMediaKey(printer = {}) {
  return String(printer.ble_device_id || printer.device_id || printer.ble_device_name || printer.name || 'cup_label');
}
