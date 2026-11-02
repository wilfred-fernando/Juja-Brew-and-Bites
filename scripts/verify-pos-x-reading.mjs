import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { shiftReportDay } from '../lib/businessDay.js';

const page=fs.readFileSync('app/pos/page.jsx','utf8');
const start=page.indexOf('function buildEndDayReportText(');
const end=page.indexOf('\nfunction getLineCategoryId(',start);
assert(start>=0 && end>start);
const build=vm.runInNewContext(`(${page.slice(start,end).trim()})`,{
  shiftReportDay, centerReceiptText: value=>value, receiptLine: ()=>'---',
  receiptPair: (key,value)=>`${key}: ${value}`, receiptAmount: value=>Number(value).toFixed(2),
  normalizeLabelLine: value=>value, formatReceiptFooterDate: value=>String(value),
  reservationQrphCollected: summary=>Number(summary.reservationQrphCollected || 0),
  SHIFT_DENOMINATIONS:[1000,500,100,50,20,10,5,1],
});
const input={store:{name:'Test Branch'},cashierName:'Cashier',startingCash:100,printedAt:'2026-11-02T00:15:00+08:00',
  summary:{shiftStartedAt:'2026-11-01T10:00:00+08:00',grossSales:230,discounts:30,netSales:200,
    discountBreakdown:[{label:'SC / PWD',amount:30}],refunds:0,cashPayments:120,cashRefunds:0,
    expectedCash:220,gcCashCollected:0,reservationQrphCollected:50,payments:{Cash:120,QRPH:80}}};
const reading=build({...input,interim:true,title:'X-READING REPORT'});
assert.match(reading,/X-READING REPORT/);
assert.match(reading,/Shift day: .*01.*2026/);
assert.match(reading,/Expected cash: 220.00/);
assert.match(reading,/Net sales: 200.00/);
assert.match(reading,/SC \/ PWD: 30.00/);
assert.match(reading,/Reservation QRPH collected: 50.00/);
assert.match(reading,/Cash: 120.00/);
assert.match(reading,/QRPH: 80.00/);
assert.match(reading,/SHIFT REMAINS OPEN/);
assert.doesNotMatch(reading,/Actual cash|Difference|CASH BREAKDOWN|END OF DAY/);
const closed=build({...input,actualCash:220,denominations:{100:2,20:1}});
assert.match(closed,/Actual cash: 220.00/);
assert.match(closed,/Difference: 0.00/);
assert.match(closed,/CASH BREAKDOWN/);
assert.match(closed,/END OF DAY/);
console.log('PASS: interim totals, overnight shift day, collections, no false cash shortage, close-report behavior preserved');
