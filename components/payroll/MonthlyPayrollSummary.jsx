"use client";
import {useState} from 'react';
import {buildMonthlyPayrollSummary} from '@/lib/payroll/monthlySummary';
import {exportReportToCSV} from '@/lib/reports/exportCsv';
const amount=value=>Number(value||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
export default function MonthlyPayrollSummary({employees,entries,periods}) {
 const [employeeId,setEmployeeId]=useState(''),[month,setMonth]=useState(()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit'}).format(new Date())),[selection,setSelection]=useState(null);
 const employee=employees.find(row=>row.id===selection?.employeeId);
 const report=selection?buildMonthlyPayrollSummary(entries,periods,selection.employeeId,selection.month):null;
 const cell='whitespace-nowrap border-b border-slate-200 px-3 py-2 text-right';
 function exportCsv() {
  const columns=['Employee','Month','Cutoff','Payday','Status','Days','Gross Pay','Deductions','Cash Advance','Net Pay'];
  const records=[...report.rows.map(row=>({Employee:employee?.full_name,Month:selection.month,Cutoff:row.period.label,Payday:row.period.pay_date,Status:row.status,Days:row.days_worked,'Gross Pay':row.gross_total,Deductions:row.deduction_total,'Cash Advance':row.cash_advance_deduction,'Net Pay':row.net_total})),{Employee:employee?.full_name,Month:selection.month,Cutoff:'Total',Days:report.totals.days_worked,'Gross Pay':report.totals.gross_total,Deductions:report.totals.deduction_total,'Cash Advance':report.totals.cash_advance_deduction,'Net Pay':report.totals.net_total}];
  exportReportToCSV(records,'monthly-payroll-summary-'+selection.month+'.csv',columns);
 }
 return <section className="rounded-2xl border border-slate-200 bg-white p-5">
  <h2 className="text-sm font-semibold text-slate-950">Monthly Payroll Summary per Employee</h2>
  <p className="mt-1 text-xs text-slate-500">Summarizes recorded payroll by payday month (cutoff end if no payday). Includes draft, approved and paid records; excludes void and 13th-month pay. No new payroll or deductions are created.</p>
  <form onSubmit={event=>{event.preventDefault();setSelection({employeeId,month});}} className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
   <label className="text-xs font-semibold text-slate-600">Employee<select required value={employeeId} onChange={event=>{setEmployeeId(event.target.value);setSelection(null);}} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Select employee</option>{employees.map(row=><option key={row.id} value={row.id}>{row.employee_no?row.employee_no+' - ':''}{row.full_name}</option>)}</select></label>
   <label className="text-xs font-semibold text-slate-600">Payroll month<input required type="month" value={month} onChange={event=>{setMonth(event.target.value);setSelection(null);}} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"/></label>
   <button className="mt-6 h-11 rounded-xl bg-slate-800 px-5 text-xs font-semibold text-white">Generate Monthly Summary</button>
  </form>
  {report&&<div className="mt-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">{employee?.full_name} · {selection.month}</h3><button type="button" onClick={exportCsv} disabled={!report.rows.length} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50">Export Summary CSV</button></div>{!report.rows.length?<p className="text-sm text-slate-500">No recorded payroll for this employee in the selected month.</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Cutoff','Payday','Status','Days','Gross Pay','Deductions','Cash Advance','Net Pay'].map(label=><th key={label} scope="col" className={cell}>{label}</th>)}</tr></thead><tbody>{report.rows.map(row=><tr key={row.id}><td className={cell}>{row.period.label}</td><td className={cell}>{row.period.pay_date||'—'}</td><td className={cell}>{row.status}</td><td className={cell}>{row.days_worked}</td>{['gross_total','deduction_total','cash_advance_deduction','net_total'].map(key=><td key={key} className={cell}>{amount(row[key])}</td>)}</tr>)}</tbody><tfoot><tr className="bg-slate-50 font-semibold"><th scope="row" colSpan={3} className={cell}>Total</th><td className={cell}>{report.totals.days_worked}</td>{['gross_total','deduction_total','cash_advance_deduction','net_total'].map(key=><td key={key} className={cell}>{amount(report.totals[key])}</td>)}</tr></tfoot></table></div>}</div>}
 </section>;
}
