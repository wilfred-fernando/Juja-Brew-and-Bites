import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import JsBarcode from "jsbarcode";
import { giftCertificateValidUntil } from "./giftCertificateDates.js";

let backgroundPromise;
function background() {
  if (!backgroundPromise) {
    backgroundPromise = readFile(path.join(process.cwd(), "public/gift-certificates/juja-100-background.png"))
      .catch((error) => { backgroundPromise = undefined; throw error; });
  }
  return backgroundPromise;
}

export async function renderGiftCertificateImage({ code, amount, expiresAt, preview = false }) {
  if (Number(amount) !== 100 || !/^[A-Z0-9-]{5,64}$/.test(String(code))) throw new Error("Invalid gift certificate data.");
  const validUntil = giftCertificateValidUntil(expiresAt);
  const encoded = {};
  JsBarcode(encoded, code, { format: "CODE128", displayValue: false });
  const bits = encoded.encodings.map((entry) => entry.data).join("");
  // Render the approved design at double size, with integer-width barcode modules and quiet zones.
  const width = 3548, height = 1774;
  // Even module widths also preserve exact bars in the common half-size download.
  const moduleWidth = Math.floor((width * 0.46) / (bits.length + 24) / 2) * 2;
  if (moduleWidth < 2) throw new Error("Certificate code is too long for this barcode layout.");
  const barcodeWidth = (bits.length + 24) * moduleWidth;
  const x = Math.round(width * 0.3 - barcodeWidth / 2), y = Math.round(height * 0.724);
  const barHeight = Math.round(height * 0.112);
  const bars = [...bits].map((bit, index) => bit === "1"
    ? `<rect x="${x + (index + 12) * moduleWidth}" y="${y}" width="${moduleWidth}" height="${barHeight}"/>` : "").join("");
  const image = await background();
  const previewBadge = preview ? `<rect x="2540" y="82" width="850" height="96" rx="48" fill="#F4777D"/>` : "";
  // Use Next's bundled Noto Sans explicitly; serverless hosts need not have system fonts.
  const fontfile = path.join(process.cwd(), "node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf");
  const textImage = (text, size, color, bold = false) => sharp({ text: {
    text: `<span foreground="${color}"${bold ? ' weight="bold"' : ""}>${text}</span>`,
    font: `Noto Sans ${size}`, fontfile, dpi: 72, rgba: true,
  } }).png().toBuffer({ resolveWithObject: true });
  const [dateText, codeText, badgeText] = await Promise.all([
    textImage(validUntil, 60, "#684220", true), textImage(code, 34, "#000000"),
    preview ? textImage("PREVIEW · NOT REDEEMABLE", 35, "#FFFFFF", true) : null,
  ]);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}">
    <image width="${width}" height="${height}" xlink:href="data:image/png;base64,${image.toString("base64")}"/>
    <rect x="${x}" y="${y - 8}" width="${barcodeWidth}" height="${barHeight + 82}" fill="white"/>
    <g fill="black" shape-rendering="crispEdges">${bars}</g>
    ${previewBadge}
  </svg>`;
  const overlays = [
    { input: dateText.data, left: 900, top: 977 },
    { input: codeText.data, left: Math.round(x + barcodeWidth / 2 - codeText.info.width / 2), top: y + barHeight + 25 },
  ];
  if (badgeText) overlays.push({ input: badgeText.data, left: Math.round(2965 - badgeText.info.width / 2), top: Math.round(130 - badgeText.info.height / 2) });
  return sharp(Buffer.from(svg)).composite(overlays).png({ palette: true, colours: 256, dither: 0, effort: 3 }).toBuffer();
}
