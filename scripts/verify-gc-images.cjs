const fs=require('node:fs');const assert=require('node:assert/strict');const sharp=require('sharp');const z=require('html5-qrcode/third_party/zxing-js.umd.js');
(async()=>{
const {renderGiftCertificateImage}=await import('../lib/bookings/giftCertificateImage.js');
const {giftCertificateValidUntil}=await import('../lib/bookings/giftCertificateDates.js');
const {cancellationGiftEmail}=await import('../lib/bookings/cancellationGiftEmail.js');
const code='JUJA-GC-123456789012345678';const expiresAt='2026-12-11T16:00:00.000Z';
assert.equal(giftCertificateValidUntil(expiresAt),'Dec 11, 2026');
assert.throws(()=>giftCertificateValidUntil('invalid'));
const started=Date.now();const png=await renderGiftCertificateImage({code,amount:100,expiresAt,preview:true});
fs.mkdirSync('output/gift-certificates',{recursive:true});fs.writeFileSync('output/gift-certificates/juja-100-production-preview.png',png);
for(const width of [3548,1774,1200]){
const resized=await sharp(png).resize({width}).png().toBuffer();const meta=await sharp(resized).metadata();
const {data,info}=await sharp(resized).extract({left:Math.round(width*.06),top:Math.round(meta.height*.712),width:Math.round(width*.48),height:Math.round(meta.height*.14)}).greyscale().raw().toBuffer({resolveWithObject:true});
const bitmap=new z.BinaryBitmap(new z.HybridBinarizer(new z.RGBLuminanceSource(new Uint8ClampedArray(data),info.width,info.height)));
assert.equal(new z.MultiFormatReader().decode(bitmap,new Map([[z.DecodeHintType.POSSIBLE_FORMATS,[z.BarcodeFormat.CODE_128]],[z.DecodeHintType.TRY_HARDER,true]])).getText(),code);
console.log('PASS barcode at '+width+'px');}
const draft=cancellationGiftEmail({customer_name:'Test',booking_id:'TEST',amount:100,expires_at:expiresAt},[{code}]);
assert.ok(draft.text.includes('Valid until: Dec 11, 2026'));assert.ok(draft.text.includes(code));
await assert.rejects(renderGiftCertificateImage({code,amount:200,expiresAt}),/Invalid/);
console.log('PASS expiry date, email text, invalid denomination. PNG '+Math.round(png.length/1024)+' KB; '+(Date.now()-started)+' ms');
})().catch(error=>{console.error(error.message||error);process.exitCode=1});


