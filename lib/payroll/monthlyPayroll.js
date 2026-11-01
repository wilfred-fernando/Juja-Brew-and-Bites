export function monthlyPayrollPeriod(month) {
 if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Select a valid payroll month.');
 const [year, number] = month.split('-').map(Number);
 const end = new Date(Date.UTC(year, number, 0)).toISOString().slice(0,10);
 const pay = new Date(Date.UTC(year, number, 1)).toISOString().slice(0,10);
 return {id:'monthly-'+month,label:'Monthly Payroll '+month,period_start:month+'-01',period_end:end,pay_date:pay,status:'draft'};
}
export function monthlyAttendance(rows, employeeId, period) {
 const dates = new Map();
 for (const row of rows) {
  if (row.employee_id !== employeeId || row.work_date < period.period_start || row.work_date > period.period_end) continue;
  const previous = dates.get(row.work_date);
  if (!previous || String(row.updated_at || row.created_at || row.id) > String(previous.updated_at || previous.created_at || previous.id)) dates.set(row.work_date,row);
 }
 return [...dates.values()].sort((a,b)=>a.work_date.localeCompare(b.work_date));
}
export function monthlyDeductions(rows, employeeId, period, periods) {
 return rows.filter(row => {
  if (row.employee_id !== employeeId) return false;
  if (row.period_id === period.id) return true;
  const linked = periods.find(p=>p.id===row.period_id);
  if (linked) return linked.period_start >= period.period_start && linked.period_end <= period.period_end && !String(linked.id).startsWith('13th-month-');
  const date = row.payment_date || row.repayment_date || row.deduction_date;
  return date >= period.period_start && date <= period.period_end && (!('method' in row) || /payroll/i.test(row.method || ''));
 }).map(row=>({...row,period_id:period.id}));
}
