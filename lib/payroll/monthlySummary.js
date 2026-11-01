const monetaryFields = ['gross_total','deduction_total','cash_advance_deduction','net_total'];
export function buildMonthlyPayrollSummary(entries, periods, employeeId, month) {
 if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Select a valid month.');
 const byId = new Map(periods.map(period=>[period.id,period]));
 const rows = entries.filter(entry=>entry.employee_id===employeeId && entry.status!=='void' && !String(entry.period_id).startsWith('13th-month-') && !Number(entry.thirteenth_month_pay))
  .map(entry=>({...entry,period:byId.get(entry.period_id)}))
  .filter(entry=>String(entry.period?.pay_date || entry.period?.period_end || '').slice(0,7)===month)
  .sort((a,b)=>String(a.period.pay_date||a.period.period_end).localeCompare(String(b.period.pay_date||b.period.period_end)) || String(a.id).localeCompare(String(b.id)));
 const totals = Object.fromEntries(monetaryFields.map(key=>[key,rows.reduce((sum,row)=>sum+Math.round(Number(row[key]||0)*100),0)/100]));
 totals.days_worked=rows.reduce((sum,row)=>sum+Number(row.days_worked||0),0);
 return {rows,totals};
}
