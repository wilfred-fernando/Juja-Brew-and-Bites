"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/dateFormat";

const supabase = getSupabaseClient();

const money = (n) => `PHP ${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n) => Number(n || 0);

function localDate(date = new Date()) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

function previousSaturday(date = new Date()) {
  const copy = new Date(date);
  const offset = (copy.getDay() + 1) % 7;
  copy.setDate(copy.getDate() - offset);
  return localDate(copy);
}

function dateText(value) {
  if (!value) return "-";
  return formatDate(String(value).slice(0, 10));
}

function dateTextWithDay(value) {
  if (!value) return "-";
  const raw = String(value).slice(0, 10);
  const date = new Date(`${raw}T00:00:00`);
  const day = Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { weekday: "short" });
  return `${dateText(raw)}${day ? ` ${day}` : ""}`;
}

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function slug(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function compareDate(value, start, end) {
  const v = String(value || "").slice(0, 10);
  return v >= start && v <= end;
}

function blankEmployeeForm() {
  return {
    employee_no: "",
    full_name: "",
    default_daily_rate: "",
    birthday: "",
    address: "",
    contact_number: "",
    sss_no: "",
    philhealth_no: "",
    hmdf_no: "",
    emergency_contact_person: "",
  };
}

function datesBetween(start, end) {
  if (!start || !end) return [];
  const dates = [];
  let current = String(start).slice(0, 10);
  const last = String(end).slice(0, 10);
  while (current <= last && dates.length < 31) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

function normalizeTime(value) {
  if (!value) return "";
  const text = String(value).trim();
  const matched = text.match(/^(\d{1,2})(?::(\d{1,2}))?(?::\d{1,2})?\s*([ap])\.?\s*m?\.?$/i);
  const plain = text.match(/^(\d{1,2})(?::(\d{1,2}))(?::\d{1,2})?$/);
  const match = matched || plain;
  if (!match) return "";

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
  if (minute < 0 || minute > 59) return "";

  const meridiem = match[3]?.toLowerCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return "";
    if (hour === 12) hour = 0;
    if (meridiem === "p") hour += 12;
  } else if (hour < 0 || hour > 23) {
    return "";
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeMinutes(value) {
  const time = normalizeTime(value);
  if (!time) return null;
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function endpointMinutes(scheduleIn, value) {
  const start = timeMinutes(scheduleIn);
  const point = timeMinutes(value);
  if (start === null || point === null) return null;
  return point <= start ? point + 1440 : point;
}

function minutesLate(scheduleIn, actualIn) {
  const schedule = timeMinutes(scheduleIn);
  let actual = timeMinutes(actualIn);
  if (schedule === null || actual === null) return 0;
  if (actual < schedule && schedule >= 18 * 60 && actual <= 6 * 60) actual += 1440;
  const diff = actual - schedule;
  return Math.max(0, diff || 0);
}

function minutesUndertime(scheduleIn, scheduleOut, actualOut) {
  const scheduledOut = endpointMinutes(scheduleIn, scheduleOut);
  const actual = endpointMinutes(scheduleIn, actualOut);
  if (scheduledOut === null || actual === null) return 0;
  const diff = scheduledOut - actual;
  return Math.max(0, diff || 0);
}

function overtimeHours(scheduleIn, scheduleOut, actualOut) {
  const scheduledOut = endpointMinutes(scheduleIn, scheduleOut);
  const actual = endpointMinutes(scheduleIn, actualOut);
  if (scheduledOut === null || actual === null) return 0;
  const diff = actual - scheduledOut;
  return Math.max(0, Math.floor(diff / 60) || 0);
}

function attendanceStatusFromSchedule(status) {
  const value = String(status || "scheduled").toLowerCase();
  if (value === "rest_day") return "rest_day";
  if (value === "closed") return "closed";
  if (value === "absent") return "absent";
  return "present";
}

function attendanceMetrics(row) {
  if ((row.status || "present") !== "present") return { late: 0, undertime: 0, overtime: 0 };
  return {
    late: minutesLate(row.schedule_in, row.actual_in),
    undertime: minutesUndertime(row.schedule_in, row.schedule_out, row.actual_out),
    overtime: overtimeHours(row.schedule_in, row.schedule_out, row.actual_out),
  };
}

function timeLabel(value) {
  const minutes = timeMinutes(value);
  if (minutes === null) return "";
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const hour12 = hour24 % 12 || 12;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

const HOURLY_TIME_OPTIONS = Array.from({ length: 24 }, (_, hour) => {
  const value = `${String(hour).padStart(2, "0")}:00`;
  return { value, label: timeLabel(value) };
});

function timeOptionsWithCurrent(value) {
  const current = normalizeTime(value);
  if (!current || HOURLY_TIME_OPTIONS.some((option) => option.value === current)) return HOURLY_TIME_OPTIONS;
  return [...HOURLY_TIME_OPTIONS, { value: current, label: timeLabel(current) }]
    .sort((a, b) => timeMinutes(a.value) - timeMinutes(b.value));
}

function statusClass(status) {
  const s = String(status || "draft").toLowerCase();
  if (s === "paid") return "bg-cyan-50 text-cyan-700 border-cyan-100";
  if (s === "approved") return "bg-blue-50 text-blue-600 border-blue-100";
  if (s === "void") return "bg-slate-100 text-slate-500 border-slate-200";
  return "bg-amber-50 text-amber-600 border-amber-100";
}

function blankEntry(periodId = "", employeeId = "", dailyRate = 0) {
  const overtimeRate = num(dailyRate) / 8;
  const minuteRate = overtimeRate / 60;
  return {
    id: "",
    period_id: periodId,
    employee_id: employeeId,
    daily_rate: dailyRate,
    days_worked: 0,
    overtime_hours: 0,
    overtime_rate: overtimeRate,
    absent_days: 0,
    late_minutes: 0,
    late_rate_per_minute: minuteRate,
    undertime_minutes: 0,
    undertime_rate_per_minute: minuteRate,
    allowance_15th: 0,
    allowance_30th: 0,
    cash_advance_deduction: 0,
    misc_deduction_total: 0,
    notes: "",
    status: "draft",
  };
}

function buildPayrollEntryFromAttendance({ employee, period, rows, repaymentRows, miscDeductionRows = [], existingEntry = null }) {
  if (!employee || !period) return null;
  const start = period.period_start;
  const end = period.period_end;
  const periodId = period.id;
  const rowsForPeriod = rows.filter((row) => row.employee_id === employee.id && compareDate(row.work_date, start, end));
  const daysWorked = rowsForPeriod.filter((row) => row.status === "present" || row.actual_in).length;
  const late = rowsForPeriod.reduce((sum, row) => sum + num(row.late_minutes), 0);
  const under = rowsForPeriod.reduce((sum, row) => sum + num(row.undertime_minutes), 0);
  const ot = rowsForPeriod.reduce((sum, row) => sum + num(row.overtime_hours), 0);
  const absent = rowsForPeriod.filter((row) => row.status === "absent").length;
  const dailyRate = num(employee.default_daily_rate);
  const otRate = dailyRate / 8;
  const minuteRate = otRate / 60;
  const cashAdvanceDeduction = repaymentRows.filter((row) => row.employee_id === employee.id && row.period_id === periodId).reduce((sum, row) => sum + num(row.amount), 0);
  const miscDeduction = miscDeductionRows.filter((row) => row.employee_id === employee.id && row.period_id === periodId).reduce((sum, row) => sum + num(row.amount), 0);
  const allowance15th = num(existingEntry?.allowance_15th);
  const allowance30th = num(existingEntry?.allowance_30th);
  const gross = dailyRate * daysWorked + ot * otRate + allowance15th + allowance30th;
  const deduction = late * minuteRate + under * minuteRate;
  const totalDeductions = deduction + miscDeduction;

  return {
    id: `${periodId}-${employee.id}`,
    period_id: periodId,
    employee_id: employee.id,
    daily_rate: dailyRate,
    days_worked: daysWorked,
    overtime_hours: ot,
    overtime_rate: otRate,
    absent_days: absent,
    late_minutes: late,
    late_rate_per_minute: minuteRate,
    undertime_minutes: under,
    undertime_rate_per_minute: minuteRate,
    allowance_15th: allowance15th,
    allowance_30th: allowance30th,
    cash_advance_deduction: cashAdvanceDeduction,
    misc_deduction_total: miscDeduction,
    gross_total: gross,
    deduction_total: totalDeductions,
    net_total: gross - totalDeductions - cashAdvanceDeduction,
    status: existingEntry?.status || "draft",
    notes: existingEntry?.notes || "Generated from attendance cutoff.",
    generated_at: new Date().toISOString(),
  };
}

export default function AdminPayrollPage() {
  const [employees, setEmployees] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [entries, setEntries] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [repayments, setRepayments] = useState([]);
  const [miscDeductions, setMiscDeductions] = useState([]);
  const [rateChanges, setRateChanges] = useState([]);
  const [currentRole, setCurrentRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState("payroll");
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [entryForm, setEntryForm] = useState(blankEntry());
  const [employeeForm, setEmployeeForm] = useState(blankEmployeeForm());
  const [editingEmployeeId, setEditingEmployeeId] = useState("");
  const [rateIncreaseForm, setRateIncreaseForm] = useState({ employee_id: "", effective_date: localDate(), new_daily_rate: "", notes: "" });
  const [scheduleDraftRows, setScheduleDraftRows] = useState([]);
  const [attendanceDraftRows, setAttendanceDraftRows] = useState([]);
  const [advanceForm, setAdvanceForm] = useState({ employee_id: "", advance_date: localDate(), amount: "", reason: "" });
  const [repaymentForm, setRepaymentForm] = useState({ cash_advance_id: "", period_id: "", payment_date: localDate(), amount: "", method: "payroll deduction", notes: "" });
  const [miscDeductionForm, setMiscDeductionForm] = useState({ employee_id: "", period_id: "", deduction_date: localDate(), amount: "", description: "" });
  const [cutoffForm, setCutoffForm] = useState(() => {
    const start = previousSaturday();
    return { cutoff_start: start, cutoff_end: addDays(start, 6), payday: addDays(start, 7) };
  });

  useEffect(() => {
    fetchPayroll();
  }, []);

  const sortedPeriods = useMemo(
    () => [...periods].sort((a, b) => new Date(b.pay_date || b.period_end || 0) - new Date(a.pay_date || a.period_end || 0)),
    [periods]
  );

  useEffect(() => {
    if (!selectedPeriodId && sortedPeriods[0]?.id) setSelectedPeriodId(sortedPeriods[0].id);
  }, [selectedPeriodId, sortedPeriods]);

  useEffect(() => {
    const firstEmployee = employees[0]?.id || "";
    if (!selectedEmployeeId && firstEmployee) setSelectedEmployeeId(firstEmployee);
    setAdvanceForm((current) => ({ ...current, employee_id: current.employee_id || firstEmployee }));
    setRepaymentForm((current) => ({ ...current, period_id: current.period_id || selectedPeriodId }));
    setMiscDeductionForm((current) => ({ ...current, employee_id: current.employee_id || firstEmployee, period_id: current.period_id || selectedPeriodId }));
    setRateIncreaseForm((current) => ({ ...current, employee_id: current.employee_id || firstEmployee }));
  }, [employees, selectedEmployeeId, selectedPeriodId]);

  const employeeById = useMemo(() => {
    const map = {};
    employees.forEach((employee) => {
      map[employee.id] = employee;
    });
    return map;
  }, [employees]);

  const periodById = useMemo(() => {
    const map = {};
    periods.forEach((period) => {
      map[period.id] = period;
    });
    return map;
  }, [periods]);

  const selectedPeriod = periodById[selectedPeriodId];
  const canChangePayrollStatus = currentRole === "super_admin";

  const cutoffDates = useMemo(
    () => datesBetween(selectedPeriod?.period_start, selectedPeriod?.period_end),
    [selectedPeriod]
  );

  const repaymentsByAdvance = useMemo(() => {
    const map = {};
    repayments.forEach((row) => {
      if (!map[row.cash_advance_id]) map[row.cash_advance_id] = [];
      map[row.cash_advance_id].push(row);
    });
    return map;
  }, [repayments]);

  const advanceRows = useMemo(() => {
    return advances
      .map((advance) => {
        const paid = (repaymentsByAdvance[advance.id] || []).reduce((sum, row) => sum + num(row.amount), 0);
        return { ...advance, employee: employeeById[advance.employee_id], repaid: paid, balance: num(advance.amount) - paid };
      })
      .sort((a, b) => new Date(b.advance_date || 0) - new Date(a.advance_date || 0));
  }, [advances, employeeById, repaymentsByAdvance]);

  const selectedEmployeeAdvanceRows = useMemo(
    () => advanceRows.filter((row) => !selectedEmployeeId || row.employee_id === selectedEmployeeId),
    [advanceRows, selectedEmployeeId]
  );

  const selectedEmployeeOpenAdvanceRows = useMemo(
    () => selectedEmployeeAdvanceRows.filter((row) => row.balance > 0),
    [selectedEmployeeAdvanceRows]
  );

  useEffect(() => {
    if (activeTab !== "deductions") return;
    const currentIsVisible = selectedEmployeeOpenAdvanceRows.some((row) => row.id === repaymentForm.cash_advance_id);
    if (!currentIsVisible) {
      setRepaymentForm((current) => ({
        ...current,
        cash_advance_id: selectedEmployeeOpenAdvanceRows[0]?.id || "",
      }));
    }
  }, [activeTab, repaymentForm.cash_advance_id, selectedEmployeeOpenAdvanceRows]);

  const employeeAdvanceSummary = useMemo(() => {
    const map = {};
    advanceRows.forEach((row) => {
      if (!map[row.employee_id]) map[row.employee_id] = { amount: 0, repaid: 0, balance: 0 };
      map[row.employee_id].amount += num(row.amount);
      map[row.employee_id].repaid += num(row.repaid);
      map[row.employee_id].balance += Math.max(0, num(row.balance));
    });
    return map;
  }, [advanceRows]);

  const employeeBalanceRows = useMemo(
    () => employees
      .map((employee) => ({ employee, ...(employeeAdvanceSummary[employee.id] || { amount: 0, repaid: 0, balance: 0 }) }))
      .filter((row) => row.balance > 0)
      .sort((a, b) => String(a.employee.employee_no || a.employee.full_name).localeCompare(String(b.employee.employee_no || b.employee.full_name))),
    [employeeAdvanceSummary, employees]
  );

  const payrollRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((entry) => !selectedPeriodId || entry.period_id === selectedPeriodId)
      .map((entry) => ({ ...entry, employee: employeeById[entry.employee_id] }))
      .filter((entry) => {
        if (!q) return true;
        const target = `${entry.employee?.employee_no || ""} ${entry.employee?.full_name || entry.employee_id}`.toLowerCase();
        return target.includes(q);
      })
      .sort((a, b) => String(a.employee?.employee_no || a.employee?.full_name || "").localeCompare(String(b.employee?.employee_no || b.employee?.full_name || "")));
  }, [employeeById, entries, search, selectedPeriodId]);

  const summary = useMemo(() => {
    const rows = payrollRows;
    return {
      employees: rows.length,
      gross: rows.reduce((sum, row) => sum + num(row.gross_total), 0),
      deductions: rows.reduce((sum, row) => sum + num(row.deduction_total), 0),
      cashAdvances: rows.reduce((sum, row) => sum + num(row.cash_advance_deduction), 0),
      net: rows.reduce((sum, row) => sum + num(row.net_total), 0),
      late: rows.reduce((sum, row) => sum + num(row.late_minutes), 0),
      overtime: rows.reduce((sum, row) => sum + num(row.overtime_hours), 0),
      paid: rows.filter((row) => row.status === "paid").length,
    };
  }, [payrollRows]);

  const employeeTotals = useMemo(() => {
    const map = {};
    entries.forEach((entry) => {
      const key = entry.employee_id;
      if (!map[key]) map[key] = { net: 0, gross: 0, entries: 0, thirteenth: 0 };
      map[key].net += num(entry.net_total);
      map[key].gross += num(entry.gross_total);
      map[key].entries += 1;
      map[key].thirteenth = map[key].net / 12;
    });
    return map;
  }, [entries]);

  const scheduleRows = useMemo(() => {
    return scheduleDraftRows
      .map((row) => ({ ...row, employee: employeeById[row.employee_id] }))
      .sort((a, b) => String(a.work_date).localeCompare(String(b.work_date)));
  }, [employeeById, scheduleDraftRows]);

  const attendanceRows = useMemo(() => {
    return attendanceDraftRows
      .map((row) => ({ ...row, employee: employeeById[row.employee_id] }))
      .sort((a, b) => String(a.work_date).localeCompare(String(b.work_date)));
  }, [attendanceDraftRows, employeeById]);

  useEffect(() => {
    if (!selectedPeriodId || !selectedEmployeeId || cutoffDates.length === 0) {
      setScheduleDraftRows([]);
      setAttendanceDraftRows([]);
      return;
    }

    const nextSchedule = cutoffDates.map((workDate) => {
      const existing = schedules.find((row) => row.period_id === selectedPeriodId && row.employee_id === selectedEmployeeId && row.work_date === workDate);
      return existing ? {
        ...existing,
        schedule_in: normalizeTime(existing.schedule_in),
        schedule_out: normalizeTime(existing.schedule_out),
      } : {
        id: `${selectedPeriodId}-${selectedEmployeeId}-${workDate}`,
        period_id: selectedPeriodId,
        employee_id: selectedEmployeeId,
        work_date: workDate,
        schedule_in: "09:00",
        schedule_out: "18:00",
        status: "scheduled",
        notes: "",
      };
    });

    const nextAttendance = cutoffDates.map((workDate) => {
      const existing = attendance.find((row) => row.period_id === selectedPeriodId && row.employee_id === selectedEmployeeId && row.work_date === workDate);
      const schedule = nextSchedule.find((row) => row.work_date === workDate);
      const scheduleIn = normalizeTime(schedule?.schedule_in);
      const scheduleOut = normalizeTime(schedule?.schedule_out);
      const status = attendanceStatusFromSchedule(schedule?.status);
      return existing ? {
        ...existing,
        schedule_in: scheduleIn || normalizeTime(existing.schedule_in),
        schedule_out: scheduleOut || normalizeTime(existing.schedule_out),
        actual_in: normalizeTime(existing.actual_in) || (status === "present" ? scheduleIn : ""),
        actual_out: normalizeTime(existing.actual_out) || (status === "present" ? scheduleOut : ""),
        status,
      } : {
        id: `${selectedPeriodId}-${selectedEmployeeId}-${workDate}`,
        period_id: selectedPeriodId,
        employee_id: selectedEmployeeId,
        work_date: workDate,
        schedule_in: scheduleIn,
        schedule_out: scheduleOut,
        actual_in: status === "present" ? scheduleIn : "",
        actual_out: status === "present" ? scheduleOut : "",
        late_minutes: "",
        undertime_minutes: "",
        overtime_hours: "",
        status,
        notes: "",
      };
    });

    setScheduleDraftRows(nextSchedule);
    setAttendanceDraftRows(nextAttendance);
  }, [attendance, cutoffDates, schedules, selectedEmployeeId, selectedPeriodId]);

  const formTotals = useMemo(() => {
    const gross =
      num(entryForm.daily_rate) * num(entryForm.days_worked) +
      num(entryForm.overtime_hours) * num(entryForm.overtime_rate) +
      num(entryForm.allowance_15th) +
      num(entryForm.allowance_30th);
    const deductions =
      num(entryForm.late_minutes) * num(entryForm.late_rate_per_minute) +
      num(entryForm.undertime_minutes) * num(entryForm.undertime_rate_per_minute);
    const cashAdvanceDeduction = num(entryForm.cash_advance_deduction);
    const miscDeduction = num(entryForm.misc_deduction_total);
    const totalDeductions = deductions + miscDeduction;
    return { gross, deductions: totalDeductions, baseDeductions: deductions, miscDeduction, cashAdvanceDeduction, net: gross - totalDeductions - cashAdvanceDeduction };
  }, [entryForm]);

  async function fetchPayroll() {
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id || null;
    const profileRes = userId
      ? await supabase.from("profiles").select("role").eq("id", userId).maybeSingle()
      : { data: null, error: null };
    setCurrentRole(profileRes.error ? "" : normalizeRole(profileRes.data?.role));

    const [employeeRes, periodRes, entryRes, scheduleRes, attendanceRes, advanceRes, repaymentRes, miscDeductionRes] = await Promise.all([
      supabase.from("payroll_employees").select("*").order("employee_no", { ascending: true }),
      supabase.from("payroll_periods").select("*").order("pay_date", { ascending: false }),
      supabase.from("payroll_entries").select("*").order("created_at", { ascending: false }),
      supabase.from("payroll_schedules").select("*").order("work_date", { ascending: true }),
      supabase.from("payroll_attendance").select("*").order("work_date", { ascending: true }),
      supabase.from("payroll_cash_advances").select("*").order("advance_date", { ascending: false }),
      supabase.from("payroll_cash_advance_repayments").select("*").order("payment_date", { ascending: false }),
      supabase.from("payroll_misc_deductions").select("*").order("deduction_date", { ascending: false }),
    ]);
    const error = employeeRes.error || periodRes.error || entryRes.error || scheduleRes.error || attendanceRes.error || advanceRes.error || repaymentRes.error;
    if (error) {
      setNotice(`Payroll Failed: ${error.message}. Run supabase/payroll_setup.sql in Supabase first.`);
      setEmployees([]);
      setPeriods([]);
      setEntries([]);
      setSchedules([]);
      setAttendance([]);
      setAdvances([]);
      setRepayments([]);
      setMiscDeductions([]);
      setRateChanges([]);
    } else {
      const rateChangeRes = await supabase
        .from("payroll_rate_changes")
        .select("*")
        .order("effective_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      setNotice("");
      setEmployees(employeeRes.data || []);
      setPeriods(periodRes.data || []);
      setEntries(entryRes.data || []);
      setSchedules(scheduleRes.data || []);
      setAttendance(attendanceRes.data || []);
      setAdvances(advanceRes.data || []);
      setRepayments(repaymentRes.data || []);
      setMiscDeductions(miscDeductionRes.error ? [] : miscDeductionRes.data || []);
      setRateChanges(rateChangeRes.error ? [] : rateChangeRes.data || []);
    }
    setLoading(false);
  }

  function openEntryModal(entry = null) {
    if (entry) {
      setEntryForm({ ...blankEntry(), ...entry });
    } else {
      const employee = employeeById[selectedEmployeeId] || employees[0];
      setEntryForm(blankEntry(selectedPeriodId, employee?.id || "", employee?.default_daily_rate || 0));
    }
    setEntryModalOpen(true);
  }

  function setEntryField(field, value) {
    setEntryForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "employee_id") {
        const employee = employeeById[value];
        if (employee && !current.id) {
          const rate = num(employee.default_daily_rate);
          next.daily_rate = rate;
          next.overtime_rate = rate / 8;
          next.late_rate_per_minute = rate / 8 / 60;
          next.undertime_rate_per_minute = rate / 8 / 60;
        }
      }
      if (field === "daily_rate") {
        const rate = num(value);
        next.overtime_rate = rate / 8;
        next.late_rate_per_minute = rate / 8 / 60;
        next.undertime_rate_per_minute = rate / 8 / 60;
      }
      return next;
    });
  }

  async function saveEmployee(e) {
    e.preventDefault();
    if (!employeeForm.full_name.trim()) return setNotice("Employee name is required.");
    const id = editingEmployeeId || slug(employeeForm.full_name);
    if (!id) return setNotice("Employee ID could not be created.");
    const payload = {
      id,
      employee_no: employeeForm.employee_no.trim() || null,
      full_name: employeeForm.full_name.trim().toUpperCase(),
      default_daily_rate: num(employeeForm.default_daily_rate),
      birthday: employeeForm.birthday || null,
      address: employeeForm.address.trim() || null,
      contact_number: employeeForm.contact_number.trim() || null,
      sss_no: employeeForm.sss_no.trim() || null,
      philhealth_no: employeeForm.philhealth_no.trim() || null,
      hmdf_no: employeeForm.hmdf_no.trim() || null,
      emergency_contact_person: employeeForm.emergency_contact_person.trim() || null,
      active: true,
    };
    const { data, error } = await supabase.from("payroll_employees").upsert(payload).select().maybeSingle();
    if (error) return setNotice(`Employee Save Failed: ${error.message}`);
    setEmployees((prev) => [data, ...prev.filter((row) => row.id !== data.id)].sort((a, b) => String(a.employee_no || a.full_name).localeCompare(String(b.employee_no || b.full_name))));
    resetEmployeeForm();
    setNotice("Employee saved.");
  }

  function resetEmployeeForm() {
    setEditingEmployeeId("");
    setEmployeeForm(blankEmployeeForm());
  }

  function openEmployeeEdit(employee) {
    setEditingEmployeeId(employee.id);
    setEmployeeForm({
      employee_no: employee.employee_no || "",
      full_name: employee.full_name || "",
      default_daily_rate: employee.default_daily_rate ?? "",
      birthday: employee.birthday || "",
      address: employee.address || "",
      contact_number: employee.contact_number || "",
      sss_no: employee.sss_no || "",
      philhealth_no: employee.philhealth_no || "",
      hmdf_no: employee.hmdf_no || "",
      emergency_contact_person: employee.emergency_contact_person || "",
    });
  }

  async function deleteEmployee(employee) {
    if (typeof window !== "undefined" && !window.confirm(`Delete ${employee.full_name}?`)) return;
    const { error } = await supabase.from("payroll_employees").delete().eq("id", employee.id);
    if (error) return setNotice(`Employee Delete Failed: ${error.message}`);
    setEmployees((prev) => prev.filter((row) => row.id !== employee.id));
    if (selectedEmployeeId === employee.id) setSelectedEmployeeId("");
    if (editingEmployeeId === employee.id) resetEmployeeForm();
    setNotice("Employee deleted.");
  }

  async function saveRateIncrease(e) {
    e.preventDefault();
    const employee = employeeById[rateIncreaseForm.employee_id];
    const newRate = num(rateIncreaseForm.new_daily_rate);
    if (!employee || !rateIncreaseForm.effective_date || !newRate) return setNotice("Employee, effective date, and new daily rate are required.");

    const changePayload = {
      id: `rate-${employee.id}-${rateIncreaseForm.effective_date}-${Date.now()}`,
      employee_id: employee.id,
      old_daily_rate: num(employee.default_daily_rate),
      new_daily_rate: newRate,
      effective_date: rateIncreaseForm.effective_date,
      notes: rateIncreaseForm.notes.trim() || null,
    };
    const { error: changeError } = await supabase.from("payroll_rate_changes").insert(changePayload);
    if (changeError) return setNotice(`Rate Increase Failed: ${changeError.message}. Run supabase/payroll_setup.sql in Supabase first.`);

    const { data, error } = await supabase
      .from("payroll_employees")
      .update({ default_daily_rate: newRate })
      .eq("id", employee.id)
      .select()
      .maybeSingle();
    if (error) return setNotice(`Rate Update Failed: ${error.message}`);

    setEmployees((prev) => prev.map((row) => (row.id === employee.id ? data : row)));
    setRateChanges((prev) => [changePayload, ...prev].slice(0, 50));
    if (editingEmployeeId === employee.id) setEmployeeForm((current) => ({ ...current, default_daily_rate: newRate }));
    setRateIncreaseForm((current) => ({ ...current, new_daily_rate: "", notes: "" }));
    setNotice("Daily rate increase saved.");
  }

  async function toggleEmployee(employee) {
    const { data, error } = await supabase
      .from("payroll_employees")
      .update({ active: !employee.active })
      .eq("id", employee.id)
      .select()
      .maybeSingle();
    if (error) return setNotice(`Employee Update Failed: ${error.message}`);
    setEmployees((prev) => prev.map((row) => (row.id === employee.id ? data : row)));
  }

  function updateScheduleDraft(workDate, field, value) {
    const nextValue = field === "schedule_in" || field === "schedule_out" ? normalizeTime(value) : value;
    setScheduleDraftRows((rows) =>
      rows.map((row) => (row.work_date === workDate ? { ...row, [field]: nextValue } : row))
    );
  }

  function updateAttendanceDraft(workDate, field, value) {
    const nextValue = field === "schedule_in" || field === "schedule_out" || field === "actual_in" || field === "actual_out" ? normalizeTime(value) : value;
    setAttendanceDraftRows((rows) =>
      rows.map((row) => (row.work_date === workDate ? { ...row, [field]: nextValue } : row))
    );
  }

  async function saveCutoffSchedule(e) {
    e.preventDefault();
    if (!selectedPeriodId || !selectedEmployeeId || scheduleDraftRows.length === 0) return setNotice("Select a cutoff and employee first.");
    const payload = scheduleDraftRows.map((row) => ({
      id: row.id || `${selectedPeriodId}-${selectedEmployeeId}-${row.work_date}`,
      period_id: selectedPeriodId,
      employee_id: selectedEmployeeId,
      work_date: row.work_date,
      schedule_in: row.status === "scheduled" ? normalizeTime(row.schedule_in) || null : null,
      schedule_out: row.status === "scheduled" ? normalizeTime(row.schedule_out) || null : null,
      status: row.status || "scheduled",
      notes: row.notes || null,
    }));
    const { data, error } = await supabase.from("payroll_schedules").upsert(payload).select();
    if (error) return setNotice(`Schedule Save Failed: ${error.message}`);
    setSchedules((prev) => [
      ...(data || []),
      ...prev.filter((row) => !(row.period_id === selectedPeriodId && row.employee_id === selectedEmployeeId)),
    ]);
    setNotice("Cutoff schedule saved.");
  }

  async function saveCutoffAttendance(e) {
    e.preventDefault();
    if (!selectedPeriodId || !selectedEmployeeId || attendanceDraftRows.length === 0) return setNotice("Select a cutoff and employee first.");
    const payload = attendanceDraftRows.map((row) => {
      const schedule = scheduleDraftRows.find((item) => item.work_date === row.work_date) || schedules.find((item) => item.period_id === selectedPeriodId && item.employee_id === selectedEmployeeId && item.work_date === row.work_date);
      const scheduleIn = normalizeTime(schedule?.schedule_in) || normalizeTime(row.schedule_in);
      const scheduleOut = normalizeTime(schedule?.schedule_out) || normalizeTime(row.schedule_out);
      const actualIn = normalizeTime(row.actual_in);
      const actualOut = normalizeTime(row.actual_out);
      const status = attendanceStatusFromSchedule(schedule?.status || row.status);
      const computed = attendanceMetrics({ ...row, schedule_in: scheduleIn, schedule_out: scheduleOut, actual_in: actualIn, actual_out: actualOut, status });
      return {
        id: row.id || `${selectedPeriodId}-${selectedEmployeeId}-${row.work_date}`,
        period_id: selectedPeriodId,
        employee_id: selectedEmployeeId,
        work_date: row.work_date,
        schedule_in: scheduleIn || null,
        schedule_out: scheduleOut || null,
        actual_in: status === "present" ? actualIn || null : null,
        actual_out: status === "present" ? actualOut || null : null,
        late_minutes: computed.late,
        undertime_minutes: computed.undertime,
        overtime_hours: computed.overtime,
        status,
        notes: row.notes || null,
      };
    });
    const { data, error } = await supabase.from("payroll_attendance").upsert(payload).select();
    if (error) return setNotice(`Attendance Save Failed: ${error.message}`);
    const nextAttendance = [
      ...(data || []),
      ...attendance.filter((row) => !(row.period_id === selectedPeriodId && row.employee_id === selectedEmployeeId)),
    ];
    setAttendance((prev) => [
      ...(data || []),
      ...prev.filter((row) => !(row.period_id === selectedPeriodId && row.employee_id === selectedEmployeeId)),
    ]);
    const payrollSynced = await syncPayrollEntryForEmployee(selectedEmployeeId, selectedPeriod, nextAttendance);
    if (payrollSynced) setNotice("Cutoff attendance saved and payroll details updated.");
  }

  async function syncPayrollEntryForEmployee(employeeId, period, attendanceRowsSource = attendance) {
    const employee = employeeById[employeeId];
    if (!employee || !period?.id) return false;
    const existingEntry = entries.find((row) => row.period_id === period.id && row.employee_id === employeeId);
    const payload = buildPayrollEntryFromAttendance({
      employee,
      period,
      rows: attendanceRowsSource,
      repaymentRows: repayments,
      miscDeductionRows: miscDeductions,
      existingEntry,
    });
    if (!payload) return false;

    const { data, error } = await supabase.from("payroll_entries").upsert(payload).select().maybeSingle();
    if (error) {
      setNotice(`Payroll Update Failed: ${error.message}`);
      return false;
    }
    setEntries((prev) => [data, ...prev.filter((row) => row.id !== data.id)]);
    return true;
  }

  async function saveAdvance(e) {
    e.preventDefault();
    if (!advanceForm.employee_id || !advanceForm.advance_date || !num(advanceForm.amount)) return setNotice("Cash advance employee, date, and amount are required.");
    const id = `ca-${advanceForm.employee_id}-${advanceForm.advance_date}-${Date.now()}`;
    const payload = { id, ...advanceForm, amount: num(advanceForm.amount), reason: advanceForm.reason || null, status: "active" };
    const { data, error } = await supabase.from("payroll_cash_advances").insert(payload).select().maybeSingle();
    if (error) return setNotice(`Cash Advance Failed: ${error.message}`);
    setAdvances((prev) => [data, ...prev]);
    setRepaymentForm((current) => ({ ...current, cash_advance_id: data.id }));
    setSelectedEmployeeId(data.employee_id);
    setAdvanceForm({ employee_id: advanceForm.employee_id, advance_date: localDate(), amount: "", reason: "" });
    setNotice("Cash advance recorded.");
  }

  async function saveRepayment(e) {
    e.preventDefault();
    const advance = advances.find((row) => row.id === repaymentForm.cash_advance_id);
    if (!advance || !num(repaymentForm.amount)) return setNotice("Select a cash advance and repayment amount.");
    const id = `repay-${advance.id}-${repaymentForm.payment_date}-${Date.now()}`;
    const payload = {
      id,
      cash_advance_id: advance.id,
      employee_id: advance.employee_id,
      period_id: repaymentForm.period_id || null,
      payment_date: repaymentForm.payment_date,
      amount: num(repaymentForm.amount),
      method: repaymentForm.method || "payroll deduction",
      notes: repaymentForm.notes || null,
    };
    const { data, error } = await supabase.from("payroll_cash_advance_repayments").insert(payload).select().maybeSingle();
    if (error) return setNotice(`Repayment Failed: ${error.message}`);
    const paid = (repaymentsByAdvance[advance.id] || []).reduce((sum, row) => sum + num(row.amount), 0) + num(data.amount);
    setRepayments((prev) => [data, ...prev]);
    if (paid >= num(advance.amount)) {
      const { data: updated } = await supabase.from("payroll_cash_advances").update({ status: "paid" }).eq("id", advance.id).select().maybeSingle();
      if (updated) setAdvances((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    }
    setRepaymentForm({ cash_advance_id: advance.id, period_id: repaymentForm.period_id, payment_date: localDate(), amount: "", method: "payroll deduction", notes: "" });
    setNotice("Repayment recorded.");
  }

  async function saveMiscDeduction(e) {
    e.preventDefault();
    if (!miscDeductionForm.employee_id || !miscDeductionForm.period_id || !miscDeductionForm.deduction_date || !num(miscDeductionForm.amount)) {
      return setNotice("Misc deduction employee, cutoff, date, and amount are required.");
    }
    const id = `misc-${miscDeductionForm.employee_id}-${miscDeductionForm.period_id}-${miscDeductionForm.deduction_date}-${Date.now()}`;
    const payload = {
      id,
      employee_id: miscDeductionForm.employee_id,
      period_id: miscDeductionForm.period_id,
      deduction_date: miscDeductionForm.deduction_date,
      amount: num(miscDeductionForm.amount),
      description: miscDeductionForm.description.trim() || null,
    };
    const { data, error } = await supabase.from("payroll_misc_deductions").insert(payload).select().maybeSingle();
    if (error) return setNotice(`Misc Deduction Failed: ${error.message}. Run supabase/payroll_employee_deductions_update.sql first.`);
    setMiscDeductions((prev) => [data, ...prev]);
    setMiscDeductionForm((current) => ({ ...current, deduction_date: localDate(), amount: "", description: "" }));
    setNotice("Misc deduction recorded.");
  }

  async function saveEntry(e) {
    e.preventDefault();
    if (!entryForm.period_id || !entryForm.employee_id) return setNotice("Select a period and employee first.");
    setSaving(true);
    const id = entryForm.id || `${entryForm.period_id}-${entryForm.employee_id}`;
    const payload = {
      id,
      period_id: entryForm.period_id,
      employee_id: entryForm.employee_id,
      daily_rate: num(entryForm.daily_rate),
      days_worked: num(entryForm.days_worked),
      overtime_hours: num(entryForm.overtime_hours),
      overtime_rate: num(entryForm.overtime_rate),
      absent_days: num(entryForm.absent_days),
      late_minutes: num(entryForm.late_minutes),
      late_rate_per_minute: num(entryForm.late_rate_per_minute),
      undertime_minutes: num(entryForm.undertime_minutes),
      undertime_rate_per_minute: num(entryForm.undertime_rate_per_minute),
      allowance_15th: num(entryForm.allowance_15th),
      allowance_30th: num(entryForm.allowance_30th),
      cash_advance_deduction: formTotals.cashAdvanceDeduction,
      misc_deduction_total: formTotals.miscDeduction,
      gross_total: formTotals.gross,
      deduction_total: formTotals.deductions,
      net_total: formTotals.net,
      status: entryForm.status || "draft",
      notes: entryForm.notes || null,
    };
    const { data, error } = await supabase.from("payroll_entries").upsert(payload).select().maybeSingle();
    if (error) {
      setNotice(`Save Failed: ${error.message}`);
    } else {
      setEntries((prev) => [data, ...prev.filter((row) => row.id !== id)]);
      setEntryModalOpen(false);
      setNotice("Payroll entry saved.");
    }
    setSaving(false);
  }

  async function updateEntryStatus(entry, status) {
    if (!canChangePayrollStatus) return setNotice("Only super admin accounts can approve payroll or mark it as paid.");
    const { data, error } = await supabase.from("payroll_entries").update({ status }).eq("id", entry.id).select().maybeSingle();
    if (error) return setNotice(`Status Failed: ${error.message}`);
    setEntries((prev) => prev.map((row) => (row.id === entry.id ? data : row)));
  }

  async function generateCutoffPayroll(e) {
    e.preventDefault();
    const start = cutoffForm.cutoff_start;
    const end = cutoffForm.cutoff_end || addDays(start, 6);
    const payday = addDays(end, 1);
    if (!start || !end || end < start) return setNotice("Cutoff end must be on or after cutoff start.");
    if (new Date(`${start}T00:00:00`).getDay() !== 6) return setNotice("Cutoff start must be a Saturday.");
    setSaving(true);
    const periodId = `cutoff-${start}`;
    const periodPayload = {
      id: periodId,
      label: `Cutoff ${dateText(start)} - ${dateText(end)}`,
      source_sheet: null,
      period_start: start,
      period_end: end,
      pay_date: payday,
      status: "draft",
    };
    const { data: period, error: periodError } = await supabase.from("payroll_periods").upsert(periodPayload).select().maybeSingle();
    if (periodError) {
      setSaving(false);
      return setNotice(`Generate Failed: ${periodError.message}`);
    }

    const activeEmployees = employees.filter((employee) => employee.active !== false);
    const generatedRows = activeEmployees
      .map((employee) => buildPayrollEntryFromAttendance({
        employee,
        period,
        rows: attendance,
        repaymentRows: repayments,
        miscDeductionRows: miscDeductions,
        existingEntry: entries.find((row) => row.period_id === periodId && row.employee_id === employee.id),
      }))
      .filter(Boolean);

    const { data, error } = await supabase.from("payroll_entries").upsert(generatedRows).select();
    if (error) {
      setSaving(false);
      return setNotice(`Generate Failed: ${error.message}`);
    }
    setPeriods((prev) => [period, ...prev.filter((row) => row.id !== period.id)]);
    setEntries((prev) => [...(data || []), ...prev.filter((row) => row.period_id !== periodId)]);
    setSelectedPeriodId(periodId);
    setActiveTab("payroll");
    setNotice(`Generated payroll for ${dateText(start)} - ${dateText(end)}. Payday ${dateText(payday)}.`);
    setSaving(false);
  }

  function updateCutoffStart(value) {
    const end = addDays(value, 6);
    setCutoffForm({ cutoff_start: value, cutoff_end: end, payday: addDays(end, 1) });
  }

  function updateCutoffEnd(value) {
    setCutoffForm((current) => ({ ...current, cutoff_end: value, payday: addDays(value, 1) }));
  }

  return (
    <div className="space-y-6 pb-20">
      <header className="rounded-3xl border border-white/20 bg-slate-950/78 p-5 text-white shadow-[0_28px_80px_rgba(2,6,23,0.32)] backdrop-blur-xl lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan-200">Finance</p>
          <h1 className="text-3xl font-semibold text-white">Payroll System</h1>
          <p className="mt-2 text-sm text-slate-300">Saturday-Friday cutoff with Saturday payday.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select value={selectedPeriodId} onChange={(e) => setSelectedPeriodId(e.target.value)} className="h-11 rounded-xl border border-cyan-300/30 bg-white/10 px-3 text-sm font-semibold text-white outline-none transition duration-200 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/20">
            {sortedPeriods.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}
          </select>
          <button onClick={() => setActiveTab("generate")} className="h-11 rounded-xl bg-cyan-600 px-5 text-xs font-semibold uppercase tracking-wider text-white shadow-[0_0_30px_rgba(34,211,238,0.26)] transition duration-200 hover:-translate-y-0.5 hover:bg-cyan-500">Generate Cutoff</button>
        </div>
        </div>
      </header>

      {notice ? <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-3 text-sm font-semibold text-cyan-800 shadow-sm">{notice}</div> : null}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Net Payroll", money(summary.net), `${summary.employees} employee entries`],
          ["Gross Pay", money(summary.gross), `${money(summary.deductions)} deductions`],
          ["Cash Advance", money(summary.cashAdvances), `${summary.late.toFixed(0)} late minutes`],
          ["Paid Status", `${summary.paid}/${summary.employees}`, selectedPeriod ? `${dateText(selectedPeriod.period_start)} - ${dateText(selectedPeriod.period_end)}` : "No period"],
        ].map(([label, value, sub]) => (
          <div key={label} className="rounded-2xl border border-white/70 bg-white/78 p-5 shadow-[0_22px_55px_rgba(15,23,42,0.10)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-200/80 hover:shadow-[0_24px_60px_rgba(8,145,178,0.14)]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{sub}</p>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/70 bg-white/72 p-1 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl md:grid-cols-3 xl:grid-cols-7">
        {[
          ["payroll", "Payroll"],
          ["generate", "Generate"],
          ["employees", "Employees"],
          ["schedule", "Schedule"],
          ["attendance", "Attendance"],
          ["deductions", "Deductions"],
          ["cashAdvance", "Cash Advance"],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} className={`h-10 rounded-xl text-xs font-semibold uppercase tracking-wider transition duration-200 ${activeTab === key ? "bg-slate-950 text-cyan-50 shadow-[0_0_28px_rgba(34,211,238,0.16)]" : "text-slate-600 hover:-translate-y-0.5 hover:bg-cyan-50 hover:text-cyan-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm font-bold text-slate-400">Loading payroll...</div>
      ) : activeTab === "generate" ? (
        <form onSubmit={generateCutoffPayroll} className="grid grid-cols-1 gap-4 rounded-2xl border border-white/70 bg-white/78 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:grid-cols-4">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cutoff Start
            <input type="date" value={cutoffForm.cutoff_start} onChange={(e) => updateCutoffStart(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm normal-case outline-none transition duration-200 focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cutoff End
            <input type="date" value={cutoffForm.cutoff_end} onChange={(e) => updateCutoffEnd(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm normal-case outline-none transition duration-200 focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payday
            <input type="date" value={cutoffForm.payday} readOnly className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm normal-case outline-none" />
          </label>
          <button disabled={saving} className="mt-6 h-11 rounded-xl bg-cyan-600 px-5 text-xs font-semibold uppercase tracking-wider text-white shadow-[0_0_30px_rgba(8,145,178,0.30)] transition duration-200 hover:-translate-y-0.5 hover:bg-cyan-500 disabled:bg-slate-300">
            {saving ? "Generating..." : "Generate Payroll"}
          </button>
        </form>
      ) : activeTab === "payroll" ? (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-4 text-sm outline-none transition duration-200 focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20 sm:max-w-sm" placeholder="Search employee or employee no." />
            <button onClick={() => openEntryModal()} className="h-11 rounded-xl border border-cyan-100 bg-cyan-50 px-5 text-xs font-semibold uppercase tracking-wider text-cyan-700 transition duration-200 hover:-translate-y-0.5 hover:bg-cyan-100">Add Payroll</button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-white/70 bg-white/88 shadow-[0_22px_55px_rgba(15,23,42,0.10)] backdrop-blur-xl">
            <table className="w-full min-w-[1280px] text-sm">
              <thead className="sticky top-0 bg-slate-950 text-left text-[10px] uppercase tracking-[0.16em] text-cyan-50">
                <tr>
                  <th className="p-3">Emp No.</th>
                  <th>Employee</th>
                  <th>Rate</th>
                  <th>Days</th>
                  <th>OT</th>
                  <th>Late</th>
                  <th>Absent</th>
                  <th>Gross</th>
                  <th>Deductions</th>
                  <th>Cash Adv.</th>
                  <th>Net</th>
                  <th>Status</th>
                    <th className="text-right pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payrollRows.length === 0 ? (
                  <tr><td colSpan="13" className="p-8 text-center text-sm font-semibold text-slate-400">No payroll rows found.</td></tr>
                ) : payrollRows.map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-100 transition duration-200 hover:bg-cyan-50/45">
                    <td className="p-3 font-semibold text-slate-600">{entry.employee?.employee_no || "-"}</td>
                    <td className="font-semibold text-slate-900">{entry.employee?.full_name || entry.employee_id}</td>
                    <td>{money(entry.daily_rate)}</td>
                    <td>{num(entry.days_worked).toFixed(2)}</td>
                    <td>{num(entry.overtime_hours).toFixed(2)}</td>
                    <td>{num(entry.late_minutes).toFixed(0)}m</td>
                    <td>{num(entry.absent_days).toFixed(2)}</td>
                    <td>{money(entry.gross_total)}</td>
                    <td>{money(entry.deduction_total)}</td>
                    <td>{money(entry.cash_advance_deduction)}</td>
                    <td className="font-semibold text-cyan-700">{money(entry.net_total)}</td>
                    <td><span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase ${statusClass(entry.status)}`}>{entry.status || "draft"}</span></td>
                    <td className="pr-3 text-right">
                      <div className="flex justify-end gap-2">
                        {canChangePayrollStatus && entry.status !== "approved" && entry.status !== "paid" ? <button onClick={() => updateEntryStatus(entry, "approved")} className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[10px] font-semibold uppercase text-blue-600 transition hover:-translate-y-0.5">Approve</button> : null}
                        {canChangePayrollStatus && entry.status !== "paid" ? <button onClick={() => updateEntryStatus(entry, "paid")} className="rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2 text-[10px] font-semibold uppercase text-cyan-700 transition hover:-translate-y-0.5">Paid</button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : activeTab === "employees" ? (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_1fr]">
          <div className="space-y-4">
            <form onSubmit={saveEmployee} className="rounded-2xl border border-white/70 bg-white/78 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-950">{editingEmployeeId ? "Edit Employee" : "Add Employee"}</h2>
                {editingEmployeeId ? (
                  <button type="button" onClick={resetEmployeeForm} className="rounded-lg border border-slate-100 px-3 py-2 text-[10px] font-semibold uppercase text-slate-500 transition hover:border-cyan-200 hover:text-cyan-700">Cancel</button>
                ) : null}
              </div>
              <div className="mt-4 space-y-3">
                <input value={employeeForm.employee_no} onChange={(e) => setEmployeeForm((p) => ({ ...p, employee_no: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" placeholder="Employee no." />
                <input value={employeeForm.full_name} onChange={(e) => setEmployeeForm((p) => ({ ...p, full_name: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" placeholder="Employee name" />
                <input value={employeeForm.default_daily_rate} onChange={(e) => setEmployeeForm((p) => ({ ...p, default_daily_rate: e.target.value }))} type="number" step="0.01" className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" placeholder="Daily rate" />
                <input type="date" value={employeeForm.birthday} onChange={(e) => setEmployeeForm((p) => ({ ...p, birthday: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" title="Birthday" />
                <input value={employeeForm.contact_number} onChange={(e) => setEmployeeForm((p) => ({ ...p, contact_number: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" placeholder="Contact number" />
                <input value={employeeForm.address} onChange={(e) => setEmployeeForm((p) => ({ ...p, address: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" placeholder="Address" />
                <input value={employeeForm.sss_no} onChange={(e) => setEmployeeForm((p) => ({ ...p, sss_no: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" placeholder="SSS No." />
                <input value={employeeForm.philhealth_no} onChange={(e) => setEmployeeForm((p) => ({ ...p, philhealth_no: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" placeholder="Philhealth No." />
                <input value={employeeForm.hmdf_no} onChange={(e) => setEmployeeForm((p) => ({ ...p, hmdf_no: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" placeholder="HMDF No." />
                <input value={employeeForm.emergency_contact_person} onChange={(e) => setEmployeeForm((p) => ({ ...p, emergency_contact_person: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" placeholder="Emergency contact person" />
                <button className="h-11 w-full rounded-xl bg-cyan-600 text-xs font-semibold uppercase tracking-wider text-white shadow-[0_0_28px_rgba(8,145,178,0.28)] transition hover:-translate-y-0.5 hover:bg-cyan-500">{editingEmployeeId ? "Update Employee" : "Save Employee"}</button>
              </div>
            </form>

            <form onSubmit={saveRateIncrease} className="rounded-2xl border border-white/70 bg-white/78 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <h2 className="text-sm font-semibold text-slate-950">Daily Rate Increase</h2>
              <div className="mt-4 space-y-3">
                <select value={rateIncreaseForm.employee_id} onChange={(e) => setRateIncreaseForm((p) => ({ ...p, employee_id: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20">
                  {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_no ? `${employee.employee_no} - ` : ""}{employee.full_name}</option>)}
                </select>
                <input type="date" value={rateIncreaseForm.effective_date} onChange={(e) => setRateIncreaseForm((p) => ({ ...p, effective_date: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" />
                <input value={rateIncreaseForm.new_daily_rate} onChange={(e) => setRateIncreaseForm((p) => ({ ...p, new_daily_rate: e.target.value }))} type="number" step="0.01" className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" placeholder="New daily rate" />
                <input value={rateIncreaseForm.notes} onChange={(e) => setRateIncreaseForm((p) => ({ ...p, notes: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" placeholder="Notes" />
                <button className="h-11 w-full rounded-xl bg-cyan-600 text-xs font-semibold uppercase tracking-wider text-white shadow-[0_0_28px_rgba(8,145,178,0.28)] transition hover:-translate-y-0.5 hover:bg-cyan-500">Save Rate Increase</button>
              </div>
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Recent Rate Changes</p>
                {rateChanges.length === 0 ? (
                  <p className="text-xs font-semibold text-slate-400">No rate increase records yet.</p>
                ) : rateChanges.slice(0, 5).map((change) => (
                  <div key={change.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                    <p className="font-semibold text-slate-900">{employeeById[change.employee_id]?.full_name || change.employee_id}</p>
                    <p>{dateText(change.effective_date)}: {money(change.old_daily_rate)} to {money(change.new_daily_rate)}</p>
                  </div>
                ))}
              </div>
            </form>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {employees.map((employee) => {
              const total = employeeTotals[employee.id] || {};
              const advance = employeeAdvanceSummary[employee.id] || {};
              return (
                <div key={employee.id} className="rounded-2xl border border-white/70 bg-white/78 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-200/80 hover:shadow-[0_24px_60px_rgba(8,145,178,0.14)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-700">{employee.employee_no || "No employee no."}</p>
                      <h3 className="font-semibold text-slate-950">{employee.full_name}</h3>
                      <p className="mt-1 text-xs font-semibold text-slate-500">Daily rate {money(employee.default_daily_rate)}</p>
                    </div>
                    <button onClick={() => toggleEmployee(employee)} className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase transition hover:-translate-y-0.5 ${employee.active ? "bg-cyan-50 text-cyan-700" : "bg-slate-100 text-slate-500"}`}>
                      {employee.active ? "Active" : "Off"}
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 rounded-xl border border-slate-100 bg-white/70 p-3 text-xs text-slate-600 sm:grid-cols-2">
                    <p><span className="text-slate-400">Birthday:</span> {dateText(employee.birthday)}</p>
                    <p><span className="text-slate-400">Contact:</span> {employee.contact_number || "-"}</p>
                    <p className="sm:col-span-2"><span className="text-slate-400">Address:</span> {employee.address || "-"}</p>
                    <p><span className="text-slate-400">SSS:</span> {employee.sss_no || "-"}</p>
                    <p><span className="text-slate-400">PhilHealth:</span> {employee.philhealth_no || "-"}</p>
                    <p><span className="text-slate-400">HMDF:</span> {employee.hmdf_no || "-"}</p>
                    <p><span className="text-slate-400">Emergency:</span> {employee.emergency_contact_person || "-"}</p>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><span className="block text-slate-400">YTD Net</span><b>{money(total.net || 0)}</b></div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><span className="block text-slate-400">13th Est.</span><b>{money(total.thirteenth || 0)}</b></div>
                    <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-3"><span className="block text-slate-400">CA Balance</span><b>{money(advance.balance || 0)}</b></div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => openEmployeeEdit(employee)} className="rounded-lg border border-slate-100 px-3 py-2 text-[10px] font-semibold uppercase text-slate-600 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:text-cyan-700">Edit</button>
                    <button type="button" onClick={() => deleteEmployee(employee)} className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[10px] font-semibold uppercase text-red-600 transition hover:-translate-y-0.5">Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : activeTab === "schedule" ? (
        <section className="space-y-4">
          <form onSubmit={saveCutoffSchedule} className="grid grid-cols-1 gap-3 rounded-2xl border border-white/70 bg-white/78 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:grid-cols-[1fr_1fr_auto]">
            <div>
              <p className="text-sm font-semibold text-slate-950">Schedule Encoding Per Cutoff</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{selectedPeriod ? `${dateTextWithDay(selectedPeriod.period_start)} - ${dateTextWithDay(selectedPeriod.period_end)}` : "Select a cutoff period"}</p>
            </div>
            <select value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)} className="h-11 rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20">
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_no ? `${employee.employee_no} - ` : ""}{employee.full_name}</option>)}
            </select>
            <button className="h-11 rounded-xl bg-cyan-600 px-5 text-xs font-semibold uppercase tracking-wider text-white shadow-[0_0_28px_rgba(8,145,178,0.28)] transition hover:-translate-y-0.5 hover:bg-cyan-500">Save Cutoff Schedule</button>
          </form>
          <DataTable empty="No schedule rows found for this cutoff." minWidth="980px" headers={["Date", "Emp No.", "Employee", "In", "Out", "Status", "Notes"]}>
            {scheduleRows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 transition hover:bg-cyan-50/45">
                <td className="p-3 font-bold">{dateTextWithDay(row.work_date)}</td>
                <td>{row.employee?.employee_no || "-"}</td>
                <td>{row.employee?.full_name || row.employee_id}</td>
                <td><TimeSelect value={row.schedule_in} disabled={row.status !== "scheduled"} onChange={(value) => updateScheduleDraft(row.work_date, "schedule_in", value)} className="h-9 w-32 rounded-lg border border-slate-200 px-2 text-xs font-semibold outline-none focus:border-cyan-400/70 disabled:bg-slate-50" /></td>
                <td><TimeSelect value={row.schedule_out} disabled={row.status !== "scheduled"} onChange={(value) => updateScheduleDraft(row.work_date, "schedule_out", value)} className="h-9 w-32 rounded-lg border border-slate-200 px-2 text-xs font-semibold outline-none focus:border-cyan-400/70 disabled:bg-slate-50" /></td>
                <td>
                  <select value={row.status || "scheduled"} onChange={(e) => updateScheduleDraft(row.work_date, "status", e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-xs font-semibold outline-none focus:border-cyan-400/70">
                    <option value="scheduled">Scheduled</option>
                    <option value="rest_day">Rest Day</option>
                    <option value="absent">Absent</option>
                    <option value="closed">Closed</option>
                  </select>
                </td>
                <td><input value={row.notes || ""} onChange={(e) => updateScheduleDraft(row.work_date, "notes", e.target.value)} className="h-9 w-40 rounded-lg border border-slate-200 px-2 text-xs font-semibold outline-none focus:border-cyan-400/70" placeholder="Notes" /></td>
              </tr>
            ))}
          </DataTable>
        </section>
      ) : activeTab === "attendance" ? (
        <section className="space-y-4">
          <form onSubmit={saveCutoffAttendance} className="grid grid-cols-1 gap-3 rounded-2xl border border-white/70 bg-white/78 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:grid-cols-[1fr_1fr_auto]">
            <div>
              <p className="text-sm font-semibold text-slate-950">Attendance Encoding Per Cutoff</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{selectedPeriod ? `${dateTextWithDay(selectedPeriod.period_start)} - ${dateTextWithDay(selectedPeriod.period_end)}` : "Select a cutoff period"}</p>
            </div>
            <select value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)} className="h-11 rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20">
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_no ? `${employee.employee_no} - ` : ""}{employee.full_name}</option>)}
            </select>
            <button className="h-11 rounded-xl bg-cyan-600 px-5 text-xs font-semibold uppercase tracking-wider text-white shadow-[0_0_28px_rgba(8,145,178,0.28)] transition hover:-translate-y-0.5 hover:bg-cyan-500">Save Cutoff Attendance</button>
          </form>
          <DataTable empty="No attendance rows found for this cutoff." minWidth="1180px" headers={["Date", "Emp No.", "Employee", "In", "Out", "Late", "UT", "OT", "Status", "Notes"]}>
            {attendanceRows.map((row) => {
              const metrics = attendanceMetrics(row);
              return (
                <tr key={row.id} className="border-t border-slate-100 transition hover:bg-cyan-50/45">
                  <td className="p-3 font-bold">{dateTextWithDay(row.work_date)}</td>
                  <td>{row.employee?.employee_no || "-"}</td>
                  <td>{row.employee?.full_name || row.employee_id}</td>
                  <td><TimeInput value={row.actual_in} disabled={row.status !== "present"} onChange={(value) => updateAttendanceDraft(row.work_date, "actual_in", value)} className="h-9 w-32 rounded-lg border border-slate-200 px-2 text-xs font-semibold outline-none focus:border-cyan-400/70 disabled:bg-slate-50" /></td>
                  <td><TimeInput value={row.actual_out} disabled={row.status !== "present"} onChange={(value) => updateAttendanceDraft(row.work_date, "actual_out", value)} className="h-9 w-32 rounded-lg border border-slate-200 px-2 text-xs font-semibold outline-none focus:border-cyan-400/70 disabled:bg-slate-50" /></td>
                  <td><span className="inline-flex h-9 w-20 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-600">{metrics.late.toFixed(0)}m</span></td>
                  <td><span className="inline-flex h-9 w-20 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-600">{metrics.undertime.toFixed(0)}m</span></td>
                  <td><span className="inline-flex h-9 w-20 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-600">{metrics.overtime.toFixed(0)}h</span></td>
                  <td>
                    <select value={row.status || "present"} disabled className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-600">
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                      <option value="rest_day">Rest Day</option>
                      <option value="closed">Closed</option>
                    </select>
                  </td>
                  <td><input value={row.notes || ""} onChange={(e) => updateAttendanceDraft(row.work_date, "notes", e.target.value)} className="h-9 w-40 rounded-lg border border-slate-200 px-2 text-xs font-semibold outline-none focus:border-cyan-400/70" placeholder="Notes" /></td>
                </tr>
              );
            })}
          </DataTable>
        </section>
      ) : activeTab === "deductions" ? (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_1fr]">
          <div className="space-y-4">
            <form onSubmit={saveMiscDeduction} className="rounded-2xl border border-white/70 bg-white/78 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <h2 className="text-sm font-semibold text-slate-950">Misc Deduction</h2>
              <div className="mt-4 space-y-3">
                <select value={miscDeductionForm.employee_id} onChange={(e) => setMiscDeductionForm((p) => ({ ...p, employee_id: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20">
                  {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_no ? `${employee.employee_no} - ` : ""}{employee.full_name}</option>)}
                </select>
                <select value={miscDeductionForm.period_id} onChange={(e) => setMiscDeductionForm((p) => ({ ...p, period_id: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20">{sortedPeriods.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}</select>
                <input type="date" value={miscDeductionForm.deduction_date} onChange={(e) => setMiscDeductionForm((p) => ({ ...p, deduction_date: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" />
                <input type="number" step="0.01" value={miscDeductionForm.amount} onChange={(e) => setMiscDeductionForm((p) => ({ ...p, amount: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" placeholder="Amount" />
                <input value={miscDeductionForm.description} onChange={(e) => setMiscDeductionForm((p) => ({ ...p, description: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" placeholder="Description" />
                <button className="h-11 w-full rounded-xl bg-cyan-600 text-xs font-semibold uppercase tracking-wider text-white shadow-[0_0_28px_rgba(8,145,178,0.28)] transition hover:-translate-y-0.5 hover:bg-cyan-500">Save Misc Deduction</button>
              </div>
            </form>

            <form onSubmit={saveRepayment} className="rounded-2xl border border-white/70 bg-white/78 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <h2 className="text-sm font-semibold text-slate-950">Cash Advance Deduction / Repayment</h2>
              <div className="mt-4 space-y-3">
                <select value={repaymentForm.cash_advance_id} onChange={(e) => setRepaymentForm((p) => ({ ...p, cash_advance_id: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20">
                  <option value="">Select advance</option>
                  {selectedEmployeeOpenAdvanceRows.map((row) => <option key={row.id} value={row.id}>{dateText(row.advance_date)} / {money(row.balance)}</option>)}
                </select>
                <select value={repaymentForm.period_id} onChange={(e) => setRepaymentForm((p) => ({ ...p, period_id: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20">{sortedPeriods.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}</select>
                <input type="date" value={repaymentForm.payment_date} onChange={(e) => setRepaymentForm((p) => ({ ...p, payment_date: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" />
                <input type="number" step="0.01" value={repaymentForm.amount} onChange={(e) => setRepaymentForm((p) => ({ ...p, amount: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" placeholder="Repayment amount" />
                <button className="h-11 w-full rounded-xl bg-cyan-600 text-xs font-semibold uppercase tracking-wider text-white shadow-[0_0_28px_rgba(8,145,178,0.28)] transition hover:-translate-y-0.5 hover:bg-cyan-500">Save Repayment</button>
              </div>
            </form>
          </div>

          <div className="space-y-4">
            <DataTable empty="No misc deductions found for this cutoff." minWidth="860px" headers={["Date", "Employee", "Cutoff", "Description", "Amount"]}>
              {miscDeductions
                .filter((row) => !selectedPeriodId || row.period_id === selectedPeriodId)
                .map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 transition hover:bg-cyan-50/45">
                    <td className="p-3 font-semibold">{dateText(row.deduction_date)}</td>
                    <td>{employeeById[row.employee_id]?.full_name || row.employee_id}</td>
                    <td>{periodById[row.period_id]?.label || row.period_id}</td>
                    <td>{row.description || "Misc deduction"}</td>
                    <td className="font-semibold text-cyan-700">{money(row.amount)}</td>
                  </tr>
                ))}
            </DataTable>

            <DataTable empty="No cash advance repayments found for this cutoff." minWidth="860px" headers={["Date", "Employee", "Cash Advance", "Cutoff", "Amount"]}>
              {repayments
                .filter((row) => !selectedPeriodId || row.period_id === selectedPeriodId)
                .map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 transition hover:bg-cyan-50/45">
                    <td className="p-3 font-semibold">{dateText(row.payment_date)}</td>
                    <td>{employeeById[row.employee_id]?.full_name || row.employee_id}</td>
                    <td>{dateText(advances.find((advance) => advance.id === row.cash_advance_id)?.advance_date)}</td>
                    <td>{periodById[row.period_id]?.label || row.period_id || "-"}</td>
                    <td className="font-semibold text-cyan-700">{money(row.amount)}</td>
                  </tr>
                ))}
            </DataTable>
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_1fr]">
          <div className="space-y-4">
            <form onSubmit={saveAdvance} className="rounded-2xl border border-white/70 bg-white/78 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <h2 className="text-sm font-semibold text-slate-950">Cash Advance</h2>
              <div className="mt-4 space-y-3">
                <select value={advanceForm.employee_id} onChange={(e) => {
                  setAdvanceForm((p) => ({ ...p, employee_id: e.target.value }));
                  setSelectedEmployeeId(e.target.value);
                }} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20">{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_no ? `${employee.employee_no} - ` : ""}{employee.full_name}</option>)}</select>
                <input type="date" value={advanceForm.advance_date} onChange={(e) => setAdvanceForm((p) => ({ ...p, advance_date: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" />
                <input type="number" step="0.01" value={advanceForm.amount} onChange={(e) => setAdvanceForm((p) => ({ ...p, amount: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" placeholder="Amount" />
                <input value={advanceForm.reason} onChange={(e) => setAdvanceForm((p) => ({ ...p, reason: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" placeholder="Reason" />
                <button className="h-11 w-full rounded-xl bg-cyan-600 text-xs font-semibold uppercase tracking-wider text-white shadow-[0_0_28px_rgba(8,145,178,0.28)] transition hover:-translate-y-0.5 hover:bg-cyan-500">Save Advance</button>
              </div>
            </form>
          </div>
          
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/70 bg-white/78 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Cash Advance Details Per Employee</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{employeeById[selectedEmployeeId]?.full_name || "Select an employee"}</p>
                </div>
                <select value={selectedEmployeeId} onChange={(e) => {
                  setSelectedEmployeeId(e.target.value);
                  setAdvanceForm((current) => ({ ...current, employee_id: e.target.value }));
                }} className="h-11 rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20 sm:min-w-[280px]">
                  {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_no ? `${employee.employee_no} - ` : ""}{employee.full_name}</option>)}
                </select>
              </div>
            </div>
            
            <DataTable empty="No employees with cash advance balance." minWidth="820px" headers={["Employee", "Amount", "Repaid", "Balance", "Status"]}>
              {employeeBalanceRows.map((row) => (
                <tr
                  key={row.employee.id}
                  onClick={() => {
                    setSelectedEmployeeId(row.employee.id);
                    setAdvanceForm((current) => ({ ...current, employee_id: row.employee.id }));
                  }}
                  className={`cursor-pointer border-t border-slate-100 transition ${selectedEmployeeId === row.employee.id ? "bg-cyan-50" : "hover:bg-cyan-50/45"}`}
                >
                  <td className="p-3">
                    <p className="font-semibold text-slate-950">{row.employee.employee_no ? `${row.employee.employee_no} - ` : ""}{row.employee.full_name}</p>
                  </td>
                  <td>{money(row.amount)}</td>
                  <td>{money(row.repaid)}</td>
                  <td className="font-semibold text-cyan-700">{money(row.balance)}</td>
                  <td className="font-semibold text-cyan-700">Open</td>
                </tr>
              ))}
            </DataTable>            

            <DataTable empty="No cash advance records found for this employee." minWidth="1100px" headers={["Cash Advance", "Amount", "Repayment History", "Repaid", "Balance", "Status"]}>
              {selectedEmployeeAdvanceRows.map((row) => {
                const repaymentHistory = [...(repaymentsByAdvance[row.id] || [])]
                  .sort((a, b) => new Date(b.payment_date || 0) - new Date(a.payment_date || 0));
                return (
                  <tr key={row.id} className="border-t border-slate-100 align-top transition hover:bg-cyan-50/45">
                    <td className="p-3">
                      <p className="font-semibold text-slate-950">{dateText(row.advance_date)}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{row.reason || "Cash advance"}</p>
                    </td>
                    <td className="pt-3">{money(row.amount)}</td>
                    <td className="py-3 pr-3">
                      {repaymentHistory.length === 0 ? (
                        <span className="text-xs font-semibold text-slate-400">No repayment yet.</span>
                      ) : (
                        <div className="space-y-2">
                          {repaymentHistory.map((repayment) => (
                            <div key={repayment.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-slate-950">{dateText(repayment.payment_date)}</span>
                                <span className="font-semibold text-cyan-700">{money(repayment.amount)}</span>
                              </div>
                              <p className="mt-1">{repayment.method || "payroll deduction"}{repayment.period_id ? ` / ${periodById[repayment.period_id]?.label || repayment.period_id}` : ""}</p>
                              {repayment.notes ? <p className="mt-1 text-slate-500">{repayment.notes}</p> : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="pt-3">{money(row.repaid)}</td>
                    <td className="pt-3 font-semibold text-cyan-700">{money(row.balance)}</td>
                    <td className="pt-3">{row.status || "active"}</td>
                  </tr>
                );
              })}
            </DataTable>

          </div>
        </section>
      )}

      {entryModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <form onSubmit={saveEntry} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/70 bg-white/92 shadow-[0_30px_90px_rgba(2,6,23,0.35)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <h2 className="text-lg font-semibold text-slate-950">{entryForm.id ? "Edit Payroll" : "Add Payroll"}</h2>
              <button type="button" onClick={() => setEntryModalOpen(false)} className="h-9 w-9 rounded-full bg-slate-100 text-lg font-semibold text-slate-500 transition hover:bg-slate-200">x</button>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Period
                <select value={entryForm.period_id} onChange={(e) => setEntryField("period_id", e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm normal-case outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20">{sortedPeriods.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}</select>
              </label>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Employee
                <select value={entryForm.employee_id} onChange={(e) => setEntryField("employee_id", e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm normal-case outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20">{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_no ? `${employee.employee_no} - ` : ""}{employee.full_name}</option>)}</select>
              </label>
              {[
                ["daily_rate", "Daily Rate"],
                ["days_worked", "No. of Days"],
                ["overtime_hours", "Total Overtime"],
                ["overtime_rate", "OT Rate"],
                ["absent_days", "No. of Absent"],
                ["late_minutes", "Total Late Minutes"],
                ["late_rate_per_minute", "Late Rate / Min"],
                ["undertime_minutes", "Total Undertime"],
                ["undertime_rate_per_minute", "Undertime Rate / Min"],
                ["allowance_15th", "Allowance 15th"],
                ["allowance_30th", "Allowance 30th"],
                ["misc_deduction_total", "Misc Deduction"],
                ["cash_advance_deduction", "Cash Advance Deduction"],
              ].map(([field, label]) => (
                <label key={field} className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}
                  <input type="number" step="0.01" value={entryForm[field] ?? ""} onChange={(e) => setEntryField(field, e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm normal-case outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" />
                </label>
              ))}
              <label className="md:col-span-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Notes
                <textarea value={entryForm.notes || ""} onChange={(e) => setEntryField("notes", e.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm normal-case outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3 border-y border-slate-100 bg-slate-50 p-5 text-sm md:grid-cols-4">
              <div><span className="block text-xs font-bold text-slate-400">Gross</span><b>{money(formTotals.gross)}</b></div>
              <div><span className="block text-xs font-bold text-slate-400">Deductions</span><b>{money(formTotals.deductions)}</b></div>
              <div><span className="block text-xs font-bold text-slate-400">Cash Advance</span><b>{money(formTotals.cashAdvanceDeduction)}</b></div>
              <div><span className="block text-xs font-bold text-slate-400">Net</span><b className="text-cyan-700">{money(formTotals.net)}</b></div>
            </div>
            <div className="flex justify-end gap-3 p-5">
              <button type="button" onClick={() => setEntryModalOpen(false)} className="h-11 rounded-xl border border-slate-200 px-5 text-xs font-semibold uppercase tracking-wider text-slate-500 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:text-cyan-700">Cancel</button>
              <button disabled={saving} className="h-11 rounded-xl bg-cyan-600 px-5 text-xs font-semibold uppercase tracking-wider text-white shadow-[0_0_28px_rgba(8,145,178,0.28)] transition hover:-translate-y-0.5 hover:bg-cyan-500 disabled:bg-slate-300">{saving ? "Saving..." : "Save Payroll"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function DataTable({ headers, children, empty, minWidth }) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/70 bg-white/88 shadow-[0_22px_55px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead className="sticky top-0 bg-slate-950 text-left text-[10px] uppercase tracking-[0.16em] text-cyan-50">
          <tr>{headers.map((header, idx) => <th key={header} className={idx === 0 ? "p-3" : ""}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={headers.length} className="p-8 text-center text-sm font-semibold text-slate-400">{empty}</td></tr> : rows}
        </tbody>
      </table>
    </div>
  );
}

function TimeSelect({ value, onChange, disabled, className = "" }) {
  const normalized = normalizeTime(value);
  return (
    <select
      value={normalized}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    >
      <option value="">--:--</option>
      {timeOptionsWithCurrent(normalized).map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

function TimeInput({ value, onChange, disabled, className = "" }) {
  const normalized = normalizeTime(value);
  const [draft, setDraft] = useState(timeLabel(normalized));

  useEffect(() => {
    setDraft(timeLabel(value));
  }, [value]);

  function commit() {
    const text = draft.trim();
    if (!text) {
      onChange("");
      setDraft("");
      return;
    }

    const next = normalizeTime(text);
    if (!next) {
      setDraft(timeLabel(normalized));
      return;
    }

    onChange(next);
    setDraft(timeLabel(next));
  }

  return (
    <input
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className={className}
      placeholder="9:00 AM"
    />
  );
}
