import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getCupLabelSize } from '../lib/printerLabelSize.mjs';
const source = fs.readFileSync('app/pos/page.jsx', 'utf8');
const body = source.slice(source.indexOf('async function createConfiguredCupLabelCanvas('), source.indexOf('async function renderNiimbotCupLabelImage('));
const render = new Function('getCupLabelSize', 'createCupLabelCanvas', 'createCt221bCupLabelCanvas', 'createNiimbotCupLabelCanvas', 'resizeLabelCanvas', `${body};return createConfiguredCupLabelCanvas;`)(
  getCupLabelSize,
  (text, size) => ({ layout: 'qr', size: size.key }),
  () => ({ layout: 'legacy-ct221b' }),
  () => ({ layout: 'legacy-niimbot' }),
  (canvas, size) => ({ ...canvas, size: size.key }),
);
for (const kind of ['ct221b', 'niimbot']) {
  for (const label_size of ['40x30', '50x30', '50x40', ...(kind === 'ct221b' ? ['53x40'] : [])]) {
    const result = await render('Drink\nRegular', { label_size }, kind);
    assert.equal(result.layout, label_size === '50x40' ? 'qr' : `legacy-${kind}`);
    assert.equal(result.size, label_size);
  }
}
assert.equal((await render('', {}, 'ct221b')).layout, 'legacy-ct221b');
assert.equal((await render('', {}, 'niimbot')).layout, 'qr');
assert(source.includes('const canvas = await createConfiguredCupLabelCanvas(text, cfg, "ct221b");'));
assert.equal(source.match(/const canvas = await createConfiguredCupLabelCanvas\(text, cfg\);/g)?.length, 2);
console.log('PASS: QR only on 50x40; legacy layout on every other size; browser/native Niimbot and Clabel share routing.');
