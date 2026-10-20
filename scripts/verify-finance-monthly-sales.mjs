import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {financeSalesRange,buildFinanceMonthlySales} from '../lib/reports/financeMonthlySales.js';
import {buildMonthlySales} from '../lib/reports/monthlySales.js';
import {enrichReceiptItemRows,receiptItemDetails} from '../lib/reports/receiptDetails.js';
import {buildShiftDiscountBreakdown} from '../lib/posDiscountBreakdown.js';
const daySource=fs.readFileSync('lib/businessDay.js','utf8').replace(/^export /gm,'');const {shiftBusinessDate}=vm.runInNewContext(`${daySource};({shiftBusinessDate});`,{Intl,Date});
const source=fs.readFileSync('lib/reports/salesReports.js','utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');const {normalizeSalesData}=vm.runInNewContext(`${source};({normalizeSalesData});`,{Intl,Date,shiftBusinessDate,enrichReceiptItemRows,receiptItemDetails,buildShiftDiscountBreakdown});
assert.equal(financeSalesRange('2026-07'),null);assert.equal(financeSalesRange('invalid'),null);assert.equal(financeSalesRange('2026-08').startDate,'2026-08-11');assert.equal(financeSalesRange('2026-09').startDate,'2026-09-01');assert.equal(financeSalesRange('2028-02').endDate,'2028-02-29');
const sale=(id,date,gross,discount=0,refund=0,extra={})=>({id,store_id:'pasong',created_at:`${date}T04:00:00Z`,status:refund?'partially_refunded':'paid',gross_amount:gross,total:gross-discount,discount_amount:discount,refund_amount:refund,payment_method:'Cash',...extra});
const duplicate=sale('first','2026-08-11',100,10,0,{source_web_order_id:'web-first'});
const data=normalizeSalesData({orders:[sale('excluded','2026-08-10',999),duplicate,{...duplicate},sale('partial','2026-08-12',200,20,50),sale('void','2026-08-13',40,0,40,{status:'refunded'}),sale('other-store','2026-08-11',200,0,0,{store_id:'diliman'}),sale('pending','2026-08-11',700,0,0,{status:'pending'}),sale('next-month','2026-09-01',400)],webOrders:[sale('web-first','2026-08-11',100,10,0,{status:'completed'})],orderItems:[],stores:[{id:'pasong',name:'Pasong Tamo'},{id:'diliman',name:'Diliman'}]});
const {report,range}=buildFinanceMonthlySales(data,'2026-08');assert.equal(range.startDate,'2026-08-11');assert.equal(report.rows.length,21);assert.equal(report.rows[0].date,'2026-08-11');assert.equal(report.totals.gross,540);assert.equal(report.totals.discount,30);assert.equal(report.totals.refund,90);assert.equal(report.totals.net,420);
const branch=buildFinanceMonthlySales(data,'2026-08','pasong').report;assert.equal(branch.totals.net,220);assert.equal(branch.rows[0].net,90);
const allDays=buildMonthlySales(data.sales,data.lineItems,'2026-08');assert.equal(allDays.rows.length,31,'Admin monthly reports retain all month days');
const cutoff=buildMonthlySales([{id:'old',date:'2026-08-10',gross:100,net:90,discount:10},{id:'new',date:'2026-08-11',gross:20,net:20,discount:0}],[],'2026-08','2026-08-11');assert.equal(cutoff.totals.gross,20);assert.equal(cutoff.totals.discount,0);
assert.throws(()=>buildFinanceMonthlySales(data,'2026-07'));
const routeSource=fs.readFileSync('app/api/finance/monthly-sales/route.js','utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
function endpoint(role,configured=false){
 const query=table=>{const q={select:()=>q,eq:()=>q,gte:()=>q,lt:()=>q,order:()=>q,range:async()=>({data:[],error:null}),maybeSingle:async()=>({data:{role}}),then:resolve=>resolve({data:table==='stores'?[{id:'pasong',name:'Pasong Tamo'}]:[],error:null})};return q;};
 const client={auth:{getUser:async()=>({data:{user:role?{id:'admin'}:null}})},from:query};
 return vm.runInNewContext(`${routeSource};({GET});`,{URL,Response,Promise,Date,JSON,process:{env:configured?{D1_ARCHIVE_API_URL:'https://example.test',D1_ARCHIVE_API_TOKEN:'test'}:{}},cookies:async()=>({getAll:()=>[]}),createServerClient:()=>client,normalizeSalesData,financeSalesRange,buildFinanceMonthlySales,addDays:(date,n)=>{const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);},overlayArchivedReceiptCorrections:async value=>value,fetch:async url=>{assert.equal(url.searchParams.get('from'),'2026-08-11');return Response.json({archiveThrough:'2026-08-31',orders:[duplicate],webOrders:[],orderItems:[],shiftRecords:[]});}}).GET;
}
assert.equal((await endpoint(null)({url:'https://example.test/api/finance/monthly-sales?month=2026-08'})).status,403);
assert.equal((await endpoint('cashier')({url:'https://example.test/api/finance/monthly-sales?month=2026-08'})).status,403);
assert.equal((await endpoint('admin')({url:'https://example.test/api/finance/monthly-sales?month=2026-07'})).status,400);
assert.equal((await endpoint('admin')({url:'https://example.test/api/finance/monthly-sales?month=2026-08'})).status,503);
const response=await endpoint('admin',true)({url:'https://example.test/api/finance/monthly-sales?month=2026-08'});assert.equal(response.status,200);const payload=await response.json();assert.equal(payload.report.totals.net,90);assert.equal(payload.report.rows[0].date,'2026-08-11');assert.ok(!payload.orders&&!payload.sales);
console.log('PASS: August 11 inclusive; August partial month; invalid/early months; store filters; refunds and discounts; unpaid exclusion; deduplication; legacy Admin behavior; API role/cutoff checks; archive failure; aggregate-only response. No database writes.');
