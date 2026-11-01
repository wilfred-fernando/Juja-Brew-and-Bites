// Each employee owns a payday; older shared-year records remain valid.
export function thirteenthMonthPeriodId(year, employeeId) {
  return `13th-month-${year}-employee-${employeeId}`;
}

export function existingThirteenthMonthEntry(entries, periods, year, employeeId) {
  const byId = new Map(periods.map(period => [period.id, period]));
  return entries.find(entry => {
    if (entry.employee_id !== employeeId) return false;
    const period = byId.get(entry.period_id);
    const isThirteenth = String(entry.period_id).startsWith('13th-month-') || Number(entry.thirteenth_month_pay) > 0;
    return isThirteenth && String(period?.period_end || period?.pay_date || '').slice(0, 4) === String(year);
  });
}
