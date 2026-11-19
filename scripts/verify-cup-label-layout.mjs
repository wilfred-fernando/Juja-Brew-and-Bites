import assert from 'node:assert/strict';
import { createCupLabelCanvas, wrapCupLabelText } from '../lib/cupLabelCanvas.mjs';
import { getCupLabelSize } from '../lib/printerLabelSize.mjs';

const wordContext = { measureText: value => ({ width: value.length }) };
assert.deepEqual(wrapCupLabelText(wordContext, 'Strawberry Vanilla Frappe', 22), ['Strawberry Vanilla', 'Frappe']);
assert.deepEqual(wrapCupLabelText(wordContext, 'Cocoa Cheesecake Milk Tea', 19), ['Cocoa Cheesecake', 'Milk Tea']);
assert.deepEqual(wrapCupLabelText(wordContext, 'Extraordinary', 5), ['Extraordinary']);

globalThis.Image = class { set src(value) { queueMicrotask(() => this.onload()); } };
let calls;
globalThis.document = { createElement() {
  calls = [];
  const canvas = { style: {}, getContext: () => ctx };
  const ctx = {
    font: '10px Arial', textAlign: 'left',
    measureText(value) { return { width: String(value).length * Number(this.font.match(/(\d+)px/)[1]) * .65 }; },
    fillRect() {}, drawImage(image, x, y, w, h) { calls.push({ qr: true, x, y, w, h }); },
    fillText(text, x, y, maxWidth) {
      const w = Math.min(this.measureText(text).width, maxWidth ?? Infinity);
      const h = Number(this.font.match(/(\d+)px/)[1]);
      calls.push({ text, x: x - (this.textAlign === 'right' ? w : this.textAlign === 'center' ? w / 2 : 0), y, w, h });
    },
    getImageData: () => ({ data: new Uint8ClampedArray([100, 100, 100, 255, 230, 230, 230, 255]) }),
    putImageData(pixels) { assert.deepEqual([...pixels.data], [0, 0, 0, 255, 255, 255, 255, 255]); },
  };
  return canvas;
} };
for (const kind of ['ct221b', 'niimbot']) {
  for (const label_size of ['40x30', '50x30', '50x40', ...(kind === 'ct221b' ? ['53x40'] : [])]) {
    for (const note of ['Less ice', 'Please pack separately, no ice, extra black pearl and cheesecake. '.repeat(5)]) {
      const canvas = await createCupLabelCanvas(`Juja Brew & Bites\nSHOPEEFOOD 148\nCocoa Sea Salt Milk Tea\nLarge\n50% sugar, Black Pearl, Cheesecake\nNote: ${note}\n19/11/2026 11:19|P4767798`, getCupLabelSize({ label_size }, kind));
      const qr = calls.find(call => call.qr);
      for (const call of calls.filter(call => !call.qr)) {
        assert(call.x + call.w <= qr.x || call.x >= qr.x + qr.w || call.y + call.h <= qr.y || call.y >= qr.y + qr.h, `Text overlaps QR: ${call.text}`);
        assert(call.x >= 0 && call.x + call.w <= canvas.width + 1 && call.y + call.h <= canvas.height, 'Text exceeds label');
      }
      assert(calls.some(call => call.text === 'Customer Portal'));
      const itemCall = calls.find(call => call.text.startsWith('Cocoa'));
      assert(calls.find(call => call.text === 'Large').h < itemCall.h, 'Options must be smaller than item name');
    }
  }
}
console.log('PASS: all seven printer/size combinations, long details, QR exclusion, label bounds, and pure monochrome pixels.');
