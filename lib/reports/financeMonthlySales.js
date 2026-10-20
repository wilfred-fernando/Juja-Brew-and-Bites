import { monthRange, buildMonthlySales } from './monthlySales.js';

export const FINANCE_SALES_START = '2026-08-11';
export function financeSalesRange(month) {
 const range=monthRange(month);
 if(!range||range.endDate<FINANCE_SALES_START)return null;
 return {...range,startDate:range.startDate<FINANCE_SALES_START?FINANCE_SALES_START:range.startDate};
}
export function buildFinanceMonthlySales(data,month,storeId='All') {
 const range=financeSalesRange(month);
 if(!range)throw new Error('Finance sales reporting starts August 11, 2026.');
 const sales=data.sales.filter(row=>row.date>=range.startDate&&row.date<=range.endDate&&(!storeId||storeId==='All'||String(row.storeId)===String(storeId))&&['Paid','Partial Refund','Refunded','Voided'].includes(row.status));
 const report=buildMonthlySales(sales,data.lineItems,month,FINANCE_SALES_START);
 return {range,report};
}
