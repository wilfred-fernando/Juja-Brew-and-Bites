import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildReceiptCorrection, applyReceiptCorrections, receiptPaymentSplits } from "../lib/reports/receiptCorrections.js";
import { enrichReceiptItemRows, receiptItemDetails } from "../lib/reports/receiptDetails.js";
import { buildShiftDiscountBreakdown } from "../lib/posDiscountBreakdown.js";

const businessDay = readFileSync(new URL("../lib/businessDay.js", import.meta.url), "utf8").replace(/^export /gm, "");
const { shiftBusinessDate } = vm.runInNewContext(`${businessDay}; ({shiftBusinessDate});`, { Intl, Date });
const reportSource = readFileSync(new URL("../lib/reports/salesReports.js", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
const reports = vm.runInNewContext(`${reportSource}; ({normalizeSalesData,getSalesSummary,getProductSalesReport,getCategorySalesReport,getPaymentReport,getCashierReport,getDiscountReport});`,
  { Intl, Date, shiftBusinessDate, enrichReceiptItemRows, receiptItemDetails, buildShiftDiscountBreakdown });
const items = [
  {id:"a",order_id:"sale",menu_item_id:"product-a",name:"Drink",category_name:"Drinks",quantity:1,unit_price:40,gross_amount:40,discount_amount:5,net_amount:35,line_total:35,discountName:"Existing item discount"},
  {id:"b",order_id:"sale",menu_item_id:"product-b",name:"Meal",category_name:"Meals",quantity:1,unit_price:60,gross_amount:60,discount_amount:0,net_amount:60,line_total:60},
];
const receipt = {id:"sale",status:"paid",receipt_number:"TEST",customer_name:"Test customer",created_at:"2026-10-02T04:00:00Z",store_id:"branch",cashier_id:"cashier",
  gross_amount:100,subtotal:100,total:"90",net_amount:90,discount_amount:10,discount:"10",payment_method:"Cash",items,
  source_metadata:{order_discount:{name:"Existing receipt discount",amount:5},payment_splits:[{method:"Cash",amount:90}]}};
const patch = buildReceiptCorrection({receipt,items},{discountType:"percent",discountValue:10,discountName:"Service recovery",payments:[{method:"Card",amount:0}]});
assert.equal(patch.net,81); assert.equal(patch.discount,19);
assert.equal(patch.items.reduce((sum,row)=>sum+Math.round(row.net_amount*100),0),8100);
assert.equal(patch.items.reduce((sum,row)=>sum+Math.round(row.discount_amount*100),0),1900);
assert.deepEqual(buildShiftDiscountBreakdown([patch.receipt],patch.items),[
  {label:"Service recovery",amount:9},{label:"Existing item discount",amount:5},{label:"Existing receipt discount",amount:5},
]);
const normalized = reports.normalizeSalesData({orders:[patch.receipt],orderItems:patch.items});
const summary = reports.getSalesSummary(normalized.sales);
assert.equal(summary.net,81); assert.equal(summary.gross,100); assert.equal(summary.discount,19);
const productRows = reports.getProductSalesReport(normalized.lineItems,summary.net);
assert.equal(productRows.reduce((sum,row)=>sum+Math.round(row.net*100),0),8100);
assert.equal(productRows.reduce((sum,row)=>sum+Math.round(row.discount*100),0),1900);
assert.equal(reports.getCategorySalesReport(normalized.lineItems).reduce((sum,row)=>sum+Math.round(row.net*100),0),8100);
assert.equal(reports.getCashierReport(normalized.sales)[0].net,81);
assert.equal(reports.getPaymentReport(normalized.sales,81)[0].paymentMethod,"Card");
assert.equal(reports.getPaymentReport(normalized.sales,81)[0].net,81);
const discountRows = reports.getDiscountReport(normalized.sales);
assert.equal(discountRows.reduce((sum,row)=>sum+row.discountAmount,0),19);
assert.equal(discountRows.find(row=>row.discountType==="Service recovery").discountAmount,9);
// Editing the additional discount again restores the original basis, rather
// than applying another discount to an already discounted total.
const changed = buildReceiptCorrection({receipt:patch.receipt,items:patch.items},{discountType:"amount",discountValue:0,discountName:"",payments:[{method:"QRPH",amount:0}]});
assert.equal(changed.net,90); assert.equal(changed.discount,10);
const split = buildReceiptCorrection({receipt,items},{discountType:"amount",discountValue:10,discountName:"Service recovery",payments:[{method:"Cash",amount:30},{method:"GCash",amount:50}]});
assert.equal(split.net,80); assert.equal(split.payments.reduce((sum,row)=>sum+row.amount,0),80);
assert.throws(()=>buildReceiptCorrection({receipt,items},{discountType:"amount",discountValue:10,discountName:"Service recovery",payments:[{method:"Cash",amount:31},{method:"GCash",amount:50}]}),/must equal/);
const gcReceipt={...receipt,source_metadata:{...receipt.source_metadata,payment_splits:[{method:"JUJA e-GC",amount:50},{method:"Cash",amount:40}]}};
assert.throws(()=>buildReceiptCorrection({receipt:gcReceipt,items},{discountType:"amount",discountValue:0,discountName:"",payments:[{method:"Cash",amount:90}]}),/Gift certificate/);
const gcPatch=buildReceiptCorrection({receipt:gcReceipt,items},{discountType:"amount",discountValue:10,discountName:"Service recovery",payments:[{method:"JUJA e-GC",amount:50},{method:"Card",amount:30}]});
assert.equal(gcPatch.payments[0].amount,50);
assert.throws(()=>receiptPaymentSplits({...receipt,source_metadata:{},payment_method:"Cash + Card"}),/amounts are missing/);
const web={...receipt,id:"web",status:"completed",total:105,subtotal:100,gross_amount:undefined,net_amount:undefined,discount_amount:0,discount:0,delivery_fee:5,items:[{id:"drink",name:"Drink",category:"Drinks",quantity:1,price:100}],source_metadata:{}};
const webPatch=buildReceiptCorrection({receipt:web,items:web.items},{discountType:"amount",discountValue:10,discountName:"Service recovery",payments:[{method:"QRPH",amount:0}]});
assert.equal(webPatch.net,95); assert.equal(webPatch.items[0].net_amount,90);
const webNormalized=reports.normalizeSalesData({webOrders:[{...webPatch.receipt,items:webPatch.items}]});
assert.equal(webNormalized.sales[0].net,95); assert.equal(webNormalized.lineItems[0].net,90); assert.equal(webNormalized.lineItems[0].discount,10);
const correction={source_type:"order",source_id:"sale",receipt:{...patch.receipt,updated_at:"2026-10-02T06:00:00Z"},items:patch.items};
const refunded={...correction.receipt,status:"refunded",refund_amount:81,updated_at:"2026-10-02T07:00:00Z"};
const overlaid=applyReceiptCorrections({orders:[refunded],webOrders:[],orderItems:[{...items[0],refund_amount:40}],shiftRecords:[]},[correction]);
assert.equal(overlaid.orders[0].status,"refunded"); assert.equal(overlaid.orderItems[0].refund_amount,40);
console.log("PASS: corrected totals agree across receipt, products, categories, cashier, payment and discount reports; repeat discounts, split payments, gift certificate protection, delivery fees and later refunds.");
