let portalImage;
function loadPortalImage() {
  if (!portalImage) portalImage = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => { portalImage = null; reject(new Error('Customer Portal QR could not load. Please retry printing.')); };
    image.src = '/printing/customer-portal-qr.png';
  });
  return portalImage;
}

export function wrapCupLabelText(ctx, value, width) {
  const lines = [];
  let line = '';
  for (const word of String(value || '').trim().split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}

// Render at the selected printer resolution; never rescale QR modules afterward.
export async function createCupLabelCanvas(text, size) {
  const image = await loadPortalImage();
  const canvas = document.createElement('canvas');
  canvas.width = size.w_px; canvas.height = size.h_px;
  canvas.style.width = `${size.w_mm}mm`; canvas.style.height = `${size.h_mm}mm`;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to render cup label.');
  const scale = size.dpi / 25.4;
  const margin = Math.ceil(scale * 1.3), gap = Math.ceil(scale * 1.2);
  const width = canvas.width - margin * 2;
  const footerHeight = Math.ceil(scale * 3.4);
  const footerY = canvas.height - margin - footerHeight;
  const captionSize = Math.floor(scale * 1.7);
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const footer = lines.pop() || '';
  const store = lines.shift() || 'Juja Brew & Bites';
  const dining = lines.shift() || 'ORDER';
  const item = lines.shift() || 'Item';
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000'; ctx.textBaseline = 'top';
  const fitLine = (value, y, start, available = width, weight = 500) => {
    let font = start;
    do { ctx.font = `${weight} ${font}px Arial`; if (ctx.measureText(value).width <= available) break; font--; } while (font > 1);
    ctx.fillText(value, margin, y);
  };
  fitLine(store, margin, Math.floor(scale * 2.2));
  const diningY = margin + scale * 2.8;
  fitLine(dining, diningY, Math.floor(scale * 3.8), width, 700);
  const ruleY = Math.ceil(diningY + scale * 4.6);
  ctx.fillRect(margin, ruleY, width, 1);
  const textTop = ruleY + gap;
  const qrSize = Math.floor(Math.min(scale * 16, width * .36, footerY - gap - captionSize * 1.5 - textTop));
  const qrX = canvas.width - margin - qrSize;
  const qrY = footerY - gap - captionSize * 1.5 - qrSize;
  const textWidth = qrX - gap - margin;
  const availableHeight = footerY - gap - textTop;
  let font = Math.floor(scale * 3.3), blocks;
  // Fit every item, modifier and instruction line in its own bounded column.
  do {
    blocks = [item, ...lines].map((value, index) => {
      const size = index === 0 ? font : Math.max(1, Math.floor(font * .65));
      ctx.font = `${index === 0 ? 700 : 500} ${size}px Arial`;
      return { size, lines: wrapCupLabelText(ctx, value, textWidth) };
    });
    const fitsWidth = blocks.every((block, index) => {
      ctx.font = `${index === 0 ? 700 : 500} ${block.size}px Arial`;
      return block.lines.every(line => ctx.measureText(line).width <= textWidth);
    });
    if (fitsWidth && blocks.reduce((sum, block) => sum + block.lines.length * block.size * 1.25, 0) <= availableHeight) break;
    font--;
  } while (font > 0);
  if (font === 0 || blocks.reduce((sum, block) => sum + block.lines.length * block.size * 1.25, 0) > availableHeight) {
    throw new Error('Too many cup label details for this sticker size. Select a larger sticker size.');
  }
  let y = textTop;
  blocks.forEach((block, index) => {
    ctx.font = `${index === 0 ? 700 : 500} ${block.size}px Arial`;
    block.lines.forEach(line => { ctx.fillText(line, margin, y); y += block.size * 1.25; });
  });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, qrX, qrY, qrSize, qrSize);
  ctx.font = `700 ${captionSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('Customer Portal', qrX + qrSize / 2, qrY + qrSize + scale * .5, qrSize);
  ctx.textAlign = 'left';
  ctx.fillRect(margin, footerY, width, 1);
  const [date = '', receipt = ''] = footer.split('|');
  fitLine(date, footerY + scale * .6, Math.floor(scale * 1.9), width * .7);
  ctx.textAlign = 'right'; ctx.font = `500 ${Math.floor(scale * 1.9)}px Arial`;
  ctx.fillText(receipt, canvas.width - margin, footerY + scale * .6, width * .28);
  // Thermal output contains only pure black or white, including text and logo.
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = pixels.data[i] < 170 ? 0 : 255;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value; pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}
