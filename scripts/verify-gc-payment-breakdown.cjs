const {readFileSync}=require('node:fs'); const assert=require('node:assert/strict');
(async()=>{const source=readFileSync('lib/posGiftCertificates.js','utf8');const {gcPaymentBreakdown:split}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
assert.deepEqual(split(350,2,[{method:'Cash',amount:200}]),{payments:[{method:'JUJA e-GC',amount:200},{method:'Cash',amount:150}],gcCashTendered:200,gcCashChange:50});
assert.deepEqual(split(200,2).payments,[{method:'JUJA e-GC',amount:200}]);
assert.equal(split(350.1,2,[{method:'QRPH',amount:150.1}]).payments[1].amount,150.1);
assert.equal(split(350,2,[{method:'Cash',amount:100},{method:'QRPH',amount:100}]).gcCashChange,50);
assert.throws(()=>split(50,1),/cannot exceed/);assert.throws(()=>split(350,2,[{method:'QRPH',amount:200}]),/Only cash/);assert.throws(()=>split(350,2,[{method:'Cash',amount:100}]),/remaining balance/);assert.throws(()=>split(350,2,[{method:'Cash',amount:NaN}]),/valid/);
console.log('PASS: GC-only, cash change, QRPH, split tender, cent rounding, excessive GC amount, noncash change, short payment, invalid amount.');})();
