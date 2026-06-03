"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/dateFormat";

const supabase = getSupabaseClient();

const money = (n) => `PHP ${Number(n || 0).toFixed(2)}`;
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
  const [hourValue, minuteValue] = String(value).split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
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

function statusClass(status) {
  const s = String(status || "draft").toLowerCase();
  if (s === "paid") return "bg-emerald-50 text-emerald-600 border-emerald-100";
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
    notes: "",
    status: "draft",
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
  const [rateChanges, setRateChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState("payroll");
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [entryForm, setEntryForm] = useState(blankEntry());
  const [employeeForm, setEmployeeForm] = useState({ employee_no: "", full_name: "", default_daily_rate: "" });
  const [editingEmployeeId, setEditingEmployeeId] = useState("");
  const [rateIncreaseForm, setRateIncreaseForm] = useState({ employee_id: "", effective_date: localDate(), new_daily_rate: "", notes: "" });
  const [scheduleDraftRows, setScheduleDraftRows] = useState([]);
  const [attendanceDraftRows, setAttendanceDraftRows] = useState([]);
  const [advanceForm, setAdvanceForm] = useState({ employee_id: "", advance_date: localDate(), amount: "", reason: "" });
  const [repaymentForm, setRepaymentForm] = useState({ cash_advance_id: "", period_id: "", payment_date: localDate(), amount: "", method: "payroll deduction", notes: "" });
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
      return existing ? {
        ...existing,
        schedule_in: normalizeTime(existing.schedule_in || schedule?.schedule_in),
        schedule_out: normalizeTime(existing.schedule_out || schedule?.schedule_out),
        actual_in: normalizeTime(existing.actual_in),
        actual_out: normalizeTime(existing.actual_out),
      } : {
        id: `${selectedPeriodId}-${selectedEmployeeId}-${workDate}`,
        period_id: selectedPeriodId,
        employee_id: selectedEmployeeId,
        work_date: workDate,
        schedule_in: normalizeTime(schedule?.schedule_in),
        schedule_out: normalizeTime(schedule?.schedule_out),
        actual_in: "",
        actual_out: "",
        late_minutes: "",
        undertime_minutes: "",
        overtime_hours: "",
        status: schedule?.status === "rest_day" ? "rest_day" : "present",
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
    return { gross, deductions, cashAdvanceDeduction, net: gross - deductions - cashAdvanceDeduction };
  }, [entryForm]);

  async function fetchPayroll() {
    setLoading(true);
    const [employeeRes, periodRes, entryRes, scheduleRes, attendanceRes, advanceRes, repaymentRes] = await Promise.all([
      supabase.from("payroll_employees").select("*").order("employee_no", { ascending: true }),
      supabase.from("payroll_periods").select("*").order("pay_date", { ascending: false }),
      supabase.from("payroll_entries").select("*").order("created_at", { ascending: false }),
      supabase.from("payroll_schedules").select("*").order("work_date", { ascending: true }),
      supabase.from("payroll_attendance").select("*").order("work_date", { ascending: true }),
      supabase.from("payroll_cash_advances").select("*").order("advance_date", { ascending: false }),
      supabase.from("payroll_cash_advance_repayments").select("*").order("payment_date", { ascending: false }),
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
    setEmployeeForm({ employee_no: "", full_name: "", default_daily_rate: "" });
  }

  function openEmployeeEdit(employee) {
    setEditingEmployeeId(employee.id);
    setEmployeeForm({
      employee_no: employee.employee_no || "",
      full_name: employee.full_name || "",
      default_daily_rate: employee.default_daily_rate ?? "",
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
      const scheduleIn = normalizeTime(schedule?.schedule_in || row.schedule_in);
      const scheduleOut = normalizeTime(schedule?.schedule_out || row.schedule_out);
      const actualIn = normalizeTime(row.actual_in);
      const actualOut = normalizeTime(row.actual_out);
      const status = row.status || "present";
      return {
        id: row.id || `${selectedPeriodId}-${selectedEmployeeId}-${row.work_date}`,
        period_id: selectedPeriodId,
        employee_id: selectedEmployeeId,
        work_date: row.work_date,
        schedule_in: scheduleIn || null,
        schedule_out: scheduleOut || null,
        actual_in: status === "present" ? actualIn || null : null,
        actual_out: status === "present" ? actualOut || null : null,
        late_minutes: status === "present" ? (row.late_minutes === "" ? minutesLate(scheduleIn, actualIn) : num(row.late_minutes)) : 0,
        undertime_minutes: status === "present" ? (row.undertime_minutes === "" ? minutesUndertime(scheduleIn, scheduleOut, actualOut) : num(row.undertime_minutes)) : 0,
        overtime_hours: status === "present" ? (row.overtime_hours === "" ? overtimeHours(scheduleIn, scheduleOut, actualOut) : num(row.overtime_hours)) : 0,
        status,
        notes: row.notes || null,
      };
    });
    const { data, error } = await supabase.from("payroll_attendance").upsert(payload).select();
    if (error) return setNotice(`Attendance Save Failed: ${error.message}`);
    setAttendance((prev) => [
      ...(data || []),
      ...prev.filter((row) => !(row.period_id === selectedPeriodId && row.employee_id === selectedEmployeeId)),
    ]);
    setNotice("Cutoff attendance saved.");
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
    const { data, error } = await supabase.from("payroll_entries").update({ status }).eq("id", entry.id).select().maybeSingle();
    if (error) return setNotice(`Status Failed: ${error.message}`);
    setEntries((prev) => prev.map((row) => (row.id === entry.id ? data : row)));
  }

  async function generateCutoffPayroll(e) {
    e.preventDefault();
    const start = cutoffForm.cutoff_start;
    const end = addDays(start, 6);
    const payday = addDays(start, 7);
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
    const repaymentRows = repayments.filter((row) => row.period_id === periodId);
    const generatedRows = activeEmployees.map((employee) => {
      const rows = attendance.filter((row) => row.employee_id === employee.id && compareDate(row.work_date, start, end));
      const daysWorked = rows.filter((row) => row.status === "present" || row.actual_in).length;
      const late = rows.reduce((sum, row) => sum + num(row.late_minutes), 0);
      const under = rows.reduce((sum, row) => sum + num(row.undertime_minutes), 0);
      const ot = rows.reduce((sum, row) => sum + num(row.overtime_hours), 0);
      const absent = rows.filter((row) => row.status === "absent").length;
      const dailyRate = num(employee.default_daily_rate);
      const otRate = dailyRate / 8;
      const minuteRate = otRate / 60;
      const cashAdvanceDeduction = repaymentRows.filter((row) => row.employee_id === employee.id).reduce((sum, row) => sum + num(row.amount), 0);
      const gross = dailyRate * daysWorked + ot * otRate;
      const deduction = late * minuteRate + under * minuteRate;
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
        allowance_15th: 0,
        allowance_30th: 0,
        cash_advance_deduction: cashAdvanceDeduction,
        gross_total: gross,
        deduction_total: deduction,
        net_total: gross - deduction - cashAdvanceDeduction,
        status: "draft",
        notes: "Generated from attendance cutoff.",
        generated_at: new Date().toISOString(),
      };
    });

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
    setCutoffForm({ cutoff_start: value, cutoff_end: addDays(value, 6), payday: addDays(value, 7) });
  }

  return (
    <div className="space-y-6 pb-20">
      <header className="flex flex-col gap-4 border-b border-rose-100 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#FC687D]">Finance</p>
          <h1 className="text-3xl font-black text-slate-800">Payroll System</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">Saturday-Friday cutoff with Saturday payday.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select value={selectedPeriodId} onChange={(e) => setSelectedPeriodId(e.target.value)} className="h-11 rounded-xl border border-rose-100 bg-white px-3 text-sm font-bold outline-none">
            {sortedPeriods.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}
          </select>
          <button onClick={() => setActiveTab("generate")} className="h-11 rounded-xl bg-[#FC687D] px-5 text-xs font-black uppercase tracking-wider text-white">Generate Cutoff</button>
        </div>
      </header>

      {notice ? <div className="rounded-xl border border-rose-100 bg-white p-3 text-sm font-bold text-slate-700 shadow-sm">{notice}</div> : null}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Net Payroll", money(summary.net), `${summary.employees} employee entries`],
          ["Gross Pay", money(summary.gross), `${money(summary.deductions)} deductions`],
          ["Cash Advance", money(summary.cashAdvances), `${summary.late.toFixed(0)} late minutes`],
          ["Paid Status", `${summary.paid}/${summary.employees}`, selectedPeriod ? `${dateText(selectedPeriod.period_start)} - ${dateText(selectedPeriod.period_end)}` : "No period"],
        ].map(([label, value, sub]) => (
          <div key={label} className="rounded-2xl border border-rose-50 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-black text-slate-800">{value}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{sub}</p>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-1 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["payroll", "Payroll"],
          ["generate", "Generate"],
          ["employees", "Employees"],
          ["schedule", "Schedule"],
          ["attendance", "Attendance"],
          ["cashAdvance", "Cash Advance"],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} className={`h-10 rounded-xl text-xs font-black uppercase tracking-wider ${activeTab === key ? "bg-[#FC687D] text-white" : "text-rose-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm font-bold text-slate-400">Loading payroll...</div>
      ) : activeTab === "generate" ? (
        <form onSubmit={generateCutoffPayroll} className="grid grid-cols-1 gap-4 rounded-2xl border border-rose-50 bg-white p-5 shadow-sm lg:grid-cols-4">
          <label className="text-xs font-black uppercase tracking-wider text-slate-500">Cutoff Start
            <input type="date" value={cutoffForm.cutoff_start} onChange={(e) => updateCutoffStart(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-rose-100 px-3 text-sm font-bold normal-case outline-none" />
          </label>
          <label className="text-xs font-black uppercase tracking-wider text-slate-500">Cutoff End
            <input type="date" value={cutoffForm.cutoff_end} readOnly className="mt-2 h-11 w-full rounded-xl border border-rose-100 bg-rose-50 px-3 text-sm font-bold normal-case outline-none" />
          </label>
          <label className="text-xs font-black uppercase tracking-wider text-slate-500">Payday
            <input type="date" value={cutoffForm.payday} readOnly className="mt-2 h-11 w-full rounded-xl border border-rose-100 bg-rose-50 px-3 text-sm font-bold normal-case outline-none" />
          </label>
          <button disabled={saving} className="mt-6 h-11 rounded-xl bg-[#FC687D] px-5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50">
            {saving ? "Generating..." : "Generate Payroll"}
          </button>
        </form>
      ) : activeTab === "payroll" ? (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 w-full rounded-xl border border-rose-100 bg-white px-4 text-sm font-semibold outline-none sm:max-w-sm" placeholder="Search employee or employee no." />
            <button onClick={() => openEntryModal()} className="h-11 rounded-xl border border-rose-100 bg-white px-5 text-xs font-black uppercase tracking-wider text-[#FC687D]">Add Payroll</button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-rose-50 bg-white shadow-sm">
            <table className="w-full min-w-[1280px] text-sm">
              <thead className="bg-rose-50 text-left text-[10px] uppercase tracking-wider text-rose-700">
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
                  <tr key={entry.id} className="border-t border-rose-50">
                    <td className="p-3 font-black text-slate-600">{entry.employee?.employee_no || "-"}</td>
                    <td className="font-black text-slate-800">{entry.employee?.full_name || entry.employee_id}</td>
                    <td>{money(entry.daily_rate)}</td>
                    <td>{num(entry.days_worked).toFixed(2)}</td>
                    <td>{num(entry.overtime_hours).toFixed(2)}</td>
                    <td>{num(entry.late_minutes).toFixed(0)}m</td>
                    <td>{num(entry.absent_days).toFixed(2)}</td>
                    <td>{money(entry.gross_total)}</td>
                    <td>{money(entry.deduction_total)}</td>
                    <td>{money(entry.cash_advance_deduction)}</td>
                    <td className="font-black text-[#FC687D]">{money(entry.net_total)}</td>
                    <td><span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${statusClass(entry.status)}`}>{entry.status || "draft"}</span></td>
                    <td className="pr-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEntryModal(entry)} className="rounded-lg border border-slate-100 px-3 py-2 text-[10px] font-black uppercase text-slate-600">Edit</button>
                        {entry.status !== "approved" && entry.status !== "paid" ? <button onClick={() => updateEntryStatus(entry, "approved")} className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase text-blue-600">Approve</button> : null}
                        {entry.status !== "paid" ? <button onClick={() => updateEntryStatus(entry, "paid")} className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase text-emerald-600">Paid</button> : null}
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
            <form onSubmit={saveEmployee} className="rounded-2xl border border-rose-50 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-black text-slate-800">{editingEmployeeId ? "Edit Employee" : "Add Employee"}</h2>
                {editingEmployeeId ? (
                  <button type="button" onClick={resetEmployeeForm} className="rounded-lg border border-slate-100 px-3 py-2 text-[10px] font-black uppercase text-slate-500">Cancel</button>
                ) : null}
              </div>
              <div className="mt-4 space-y-3">
                <input value={employeeForm.employee_no} onChange={(e) => setEmployeeForm((p) => ({ ...p, employee_no: e.target.value }))} className="h-11 w-full rounded-xl border border-rose-100 px-3 text-sm font-semibold outline-none" placeholder="Employee no." />
                <input value={employeeForm.full_name} onChange={(e) => setEmployeeForm((p) => ({ ...p, full_name: e.target.value }))} className="h-11 w-full rounded-xl border border-rose-100 px-3 text-sm font-semibold outline-none" placeholder="Employee name" />
                <input value={employeeForm.default_daily_rate} onChange={(e) => setEmployeeForm((p) => ({ ...p, default_daily_rate: e.target.value }))} type="number" step="0.01" className="h-11 w-full rounded-xl border border-rose-100 px-3 text-sm font-semibold outline-none" placeholder="Daily rate" />
                <button className="h-11 w-full rounded-xl bg-[#087830] text-xs font-black uppercase tracking-wider text-white">{editingEmployeeId ? "Update Employee" : "Save Employee"}</button>
              </div>
            </form>

            <form onSubmit={saveRateIncrease} className="rounded-2xl border border-rose-50 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black text-slate-800">Daily Rate Increase</h2>
              <div className="mt-4 space-y-3">
                <select value={rateIncreaseForm.employee_id} onChange={(e) => setRateIncreaseForm((p) => ({ ...p, employee_id: e.target.value }))} className="h-11 w-full rounded-xl border border-rose-100 px-3 text-sm font-semibold outline-none">
                  {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_no ? `${employee.employee_no} - ` : ""}{employee.full_name}</option>)}
                </select>
                <input type="date" value={rateIncreaseForm.effective_date} onChange={(e) => setRateIncreaseForm((p) => ({ ...p, effective_date: e.target.value }))} className="h-11 w-full rounded-xl border border-rose-100 px-3 text-sm font-semibold outline-none" />
                <input value={rateIncreaseForm.new_daily_rate} onChange={(e) => setRateIncreaseForm((p) => ({ ...p, new_daily_rate: e.target.value }))} type="number" step="0.01" className="h-11 w-full rounded-xl border border-rose-100 px-3 text-sm font-semibold outline-none" placeholder="New daily rate" />
                <input value={rateIncreaseForm.notes} onChange={(e) => setRateIncreaseForm((p) => ({ ...p, notes: e.target.value }))} className="h-11 w-full rounded-xl border border-rose-100 px-3 text-sm font-semibold outline-none" placeholder="Notes" />
                <button className="h-11 w-full rounded-xl bg-[#087830] text-xs font-black uppercase tracking-wider text-white">Save Rate Increase</button>
              </div>
              <div className="mt-4 space-y-2 border-t border-rose-50 pt-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Recent Rate Changes</p>
                {rateChanges.length === 0 ? (
                  <p className="text-xs font-semibold text-slate-400">No rate increase records yet.</p>
                ) : rateChanges.slice(0, 5).map((change) => (
                  <div key={change.id} className="rounded-xl bg-rose-50 p-3 text-xs text-slate-600">
                    <p className="font-black text-slate-800">{employeeById[change.employee_id]?.full_name || change.employee_id}</p>
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
                <div key={employee.id} className="rounded-2xl border border-rose-50 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-[#FC687D]">{employee.employee_no || "No employee no."}</p>
                      <h3 className="font-black text-slate-800">{employee.full_name}</h3>
                      <p className="mt-1 text-xs font-semibold text-slate-500">Daily rate {money(employee.default_daily_rate)}</p>
                    </div>
                    <button onClick={() => toggleEmployee(employee)} className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${employee.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                      {employee.active ? "Active" : "Off"}
                    </button>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl bg-rose-50 p-3"><span className="block text-slate-400">YTD Net</span><b>{money(total.net || 0)}</b></div>
                    <div className="rounded-xl bg-rose-50 p-3"><span className="block text-slate-400">13th Est.</span><b>{money(total.thirteenth || 0)}</b></div>
                    <div className="rounded-xl bg-rose-50 p-3"><span className="block text-slate-400">CA Balance</span><b>{money(advance.balance || 0)}</b></div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => openEmployeeEdit(employee)} className="rounded-lg border border-slate-100 px-3 py-2 text-[10px] font-black uppercase text-slate-600">Edit</button>
                    <button type="button" onClick={() => deleteEmployee(employee)} className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[10px] font-black uppercase text-red-600">Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : activeTab === "schedule" ? (
        <section className="space-y-4">
          <form onSubmit={saveCutoffSchedule} className="grid grid-cols-1 gap-3 rounded-2xl border border-rose-50 bg-white p-5 shadow-sm lg:grid-cols-[1fr_1fr_auto]">
            <div>
              <p className="text-sm font-black text-slate-800">Schedule Encoding Per Cutoff</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{selectedPeriod ? `${dateText(selectedPeriod.period_start)} - ${dateText(selectedPeriod.period_end)}` : "Select a cutoff period"}</p>
            </div>
            <select value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)} className="h-11 rounded-xl border border-rose-100 px-3 text-sm font-semibold outline-none">
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_no ? `${employee.employee_no} - ` : ""}{employee.full_name}</option>)}
            </select>
            <button className="h-11 rounded-xl bg-[#FC687D] px-5 text-xs font-black uppercase tracking-wider text-white">Save Cutoff Schedule</button>
          </form>
          <DataTable empty="No schedule rows found for this cutoff." minWidth="980px" headers={["Date", "Emp No.", "Employee", "In", "Out", "Status", "Notes"]}>
            {scheduleRows.map((row) => (
              <tr key={row.id} className="border-t border-rose-50">
                <td className="p-3 font-bold">{dateText(row.work_date)}</td>
                <td>{row.employee?.employee_no || "-"}</td>
                <td>{row.employee?.full_name || row.employee_id}</td>
                <td><input type="time" value={normalizeTime(row.schedule_in)} disabled={row.status !== "scheduled"} onChange={(e) => updateScheduleDraft(row.work_date, "schedule_in", e.target.value)} className="h-9 w-28 rounded-lg border border-rose-100 px-2 text-xs font-bold disabled:bg-slate-50" /></td>
                <td><input type="time" value={normalizeTime(row.schedule_out)} disabled={row.status !== "scheduled"} onChange={(e) => updateScheduleDraft(row.work_date, "schedule_out", e.target.value)} className="h-9 w-28 rounded-lg border border-rose-100 px-2 text-xs font-bold disabled:bg-slate-50" /></td>
                <td>
                  <select value={row.status || "scheduled"} onChange={(e) => updateScheduleDraft(row.work_date, "status", e.target.value)} className="h-9 rounded-lg border border-rose-100 px-2 text-xs font-bold">
                    <option value="scheduled">Scheduled</option>
                    <option value="rest_day">Rest Day</option>
                    <option value="closed">Closed</option>
                  </select>
                </td>
                <td><input value={row.notes || ""} onChange={(e) => updateScheduleDraft(row.work_date, "notes", e.target.value)} className="h-9 w-40 rounded-lg border border-rose-100 px-2 text-xs font-semibold" placeholder="Notes" /></td>
              </tr>
            ))}
          </DataTable>
        </section>
      ) : activeTab === "attendance" ? (
        <section className="space-y-4">
          <form onSubmit={saveCutoffAttendance} className="grid grid-cols-1 gap-3 rounded-2xl border border-rose-50 bg-white p-5 shadow-sm lg:grid-cols-[1fr_1fr_auto]">
            <div>
              <p className="text-sm font-black text-slate-800">Attendance Encoding Per Cutoff</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{selectedPeriod ? `${dateText(selectedPeriod.period_start)} - ${dateText(selectedPeriod.period_end)}` : "Select a cutoff period"}</p>
            </div>
            <select value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)} className="h-11 rounded-xl border border-rose-100 px-3 text-sm font-semibold outline-none">
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_no ? `${employee.employee_no} - ` : ""}{employee.full_name}</option>)}
            </select>
            <button className="h-11 rounded-xl bg-[#FC687D] px-5 text-xs font-black uppercase tracking-wider text-white">Save Cutoff Attendance</button>
          </form>
          <DataTable empty="No attendance rows found for this cutoff." minWidth="1180px" headers={["Date", "Emp No.", "Employee", "In", "Out", "Late", "UT", "OT", "Status", "Notes"]}>
            {attendanceRows.map((row) => (
              <tr key={row.id} className="border-t border-rose-50">
                <td className="p-3 font-bold">{dateText(row.work_date)}</td>
                <td>{row.employee?.employee_no || "-"}</td>
                <td>{row.employee?.full_name || row.employee_id}</td>
                <td><input type="time" value={normalizeTime(row.actual_in)} disabled={row.status !== "present"} onChange={(e) => updateAttendanceDraft(row.work_date, "actual_in", e.target.value)} className="h-9 w-28 rounded-lg border border-rose-100 px-2 text-xs font-bold disabled:bg-slate-50" /></td>
                <td><input type="time" value={normalizeTime(row.actual_out)} disabled={row.status !== "present"} onChange={(e) => updateAttendanceDraft(row.work_date, "actual_out", e.target.value)} className="h-9 w-28 rounded-lg border border-rose-100 px-2 text-xs font-bold disabled:bg-slate-50" /></td>
                <td><input type="number" value={row.late_minutes ?? ""} disabled={row.status !== "present"} onChange={(e) => updateAttendanceDraft(row.work_date, "late_minutes", e.target.value)} className="h-9 w-20 rounded-lg border border-rose-100 px-2 text-xs font-bold disabled:bg-slate-50" placeholder="Auto" /></td>
                <td><input type="number" value={row.undertime_minutes ?? ""} disabled={row.status !== "present"} onChange={(e) => updateAttendanceDraft(row.work_date, "undertime_minutes", e.target.value)} className="h-9 w-20 rounded-lg border border-rose-100 px-2 text-xs font-bold disabled:bg-slate-50" placeholder="Auto" /></td>
                <td><input type="number" step="1" value={row.overtime_hours ?? ""} disabled={row.status !== "present"} onChange={(e) => updateAttendanceDraft(row.work_date, "overtime_hours", e.target.value)} className="h-9 w-20 rounded-lg border border-rose-100 px-2 text-xs font-bold disabled:bg-slate-50" placeholder="Auto" /></td>
                <td>
                  <select value={row.status || "present"} onChange={(e) => updateAttendanceDraft(row.work_date, "status", e.target.value)} className="h-9 rounded-lg border border-rose-100 px-2 text-xs font-bold">
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="rest_day">Rest Day</option>
                    <option value="closed">Closed</option>
                  </select>
                </td>
                <td><input value={row.notes || ""} onChange={(e) => updateAttendanceDraft(row.work_date, "notes", e.target.value)} className="h-9 w-40 rounded-lg border border-rose-100 px-2 text-xs font-semibold" placeholder="Notes" /></td>
              </tr>
            ))}
          </DataTable>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_1fr]">
          <div className="space-y-4">
            <form onSubmit={saveAdvance} className="rounded-2xl border border-rose-50 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black text-slate-800">Cash Advance</h2>
              <div className="mt-4 space-y-3">
                <select value={advanceForm.employee_id} onChange={(e) => setAdvanceForm((p) => ({ ...p, employee_id: e.target.value }))} className="h-11 w-full rounded-xl border border-rose-100 px-3 text-sm font-semibold outline-none">{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_no ? `${employee.employee_no} - ` : ""}{employee.full_name}</option>)}</select>
                <input type="date" value={advanceForm.advance_date} onChange={(e) => setAdvanceForm((p) => ({ ...p, advance_date: e.target.value }))} className="h-11 w-full rounded-xl border border-rose-100 px-3 text-sm font-semibold outline-none" />
                <input type="number" step="0.01" value={advanceForm.amount} onChange={(e) => setAdvanceForm((p) => ({ ...p, amount: e.target.value }))} className="h-11 w-full rounded-xl border border-rose-100 px-3 text-sm font-semibold outline-none" placeholder="Amount" />
                <input value={advanceForm.reason} onChange={(e) => setAdvanceForm((p) => ({ ...p, reason: e.target.value }))} className="h-11 w-full rounded-xl border border-rose-100 px-3 text-sm font-semibold outline-none" placeholder="Reason" />
                <button className="h-11 w-full rounded-xl bg-[#FC687D] text-xs font-black uppercase tracking-wider text-white">Save Advance</button>
              </div>
            </form>
            <form onSubmit={saveRepayment} className="rounded-2xl border border-rose-50 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black text-slate-800">Repayment</h2>
              <div className="mt-4 space-y-3">
                <select value={repaymentForm.cash_advance_id} onChange={(e) => setRepaymentForm((p) => ({ ...p, cash_advance_id: e.target.value }))} className="h-11 w-full rounded-xl border border-rose-100 px-3 text-sm font-semibold outline-none">
                  <option value="">Select advance</option>
                  {advanceRows.filter((row) => row.balance > 0).map((row) => <option key={row.id} value={row.id}>{row.employee?.employee_no ? `${row.employee.employee_no} - ` : ""}{row.employee?.full_name} / {money(row.balance)}</option>)}
                </select>
                <select value={repaymentForm.period_id} onChange={(e) => setRepaymentForm((p) => ({ ...p, period_id: e.target.value }))} className="h-11 w-full rounded-xl border border-rose-100 px-3 text-sm font-semibold outline-none">{sortedPeriods.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}</select>
                <input type="date" value={repaymentForm.payment_date} onChange={(e) => setRepaymentForm((p) => ({ ...p, payment_date: e.target.value }))} className="h-11 w-full rounded-xl border border-rose-100 px-3 text-sm font-semibold outline-none" />
                <input type="number" step="0.01" value={repaymentForm.amount} onChange={(e) => setRepaymentForm((p) => ({ ...p, amount: e.target.value }))} className="h-11 w-full rounded-xl border border-rose-100 px-3 text-sm font-semibold outline-none" placeholder="Repayment amount" />
                <button className="h-11 w-full rounded-xl bg-[#FC687D] text-xs font-black uppercase tracking-wider text-white">Save Repayment</button>
              </div>
            </form>
          </div>
          <DataTable empty="No cash advance records found." minWidth="900px" headers={["Date", "Emp No.", "Employee", "Amount", "Repaid", "Balance", "Status"]}>
            {advanceRows.map((row) => (
              <tr key={row.id} className="border-t border-rose-50">
                <td className="p-3 font-bold">{dateText(row.advance_date)}</td>
                <td>{row.employee?.employee_no || "-"}</td>
                <td>{row.employee?.full_name || row.employee_id}</td>
                <td>{money(row.amount)}</td>
                <td>{money(row.repaid)}</td>
                <td className="font-black text-[#FC687D]">{money(row.balance)}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </DataTable>
        </section>
      )}

      {entryModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form onSubmit={saveEntry} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-rose-50 p-5">
              <h2 className="text-lg font-black text-slate-800">{entryForm.id ? "Edit Payroll" : "Add Payroll"}</h2>
              <button type="button" onClick={() => setEntryModalOpen(false)} className="h-9 w-9 rounded-full bg-slate-100 text-lg font-black text-slate-500">x</button>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
              <label className="text-xs font-black uppercase tracking-wider text-slate-500">Period
                <select value={entryForm.period_id} onChange={(e) => setEntryField("period_id", e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-rose-100 px-3 text-sm font-bold normal-case outline-none">{sortedPeriods.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}</select>
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-slate-500">Employee
                <select value={entryForm.employee_id} onChange={(e) => setEntryField("employee_id", e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-rose-100 px-3 text-sm font-bold normal-case outline-none">{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_no ? `${employee.employee_no} - ` : ""}{employee.full_name}</option>)}</select>
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
                ["cash_advance_deduction", "Cash Advance Deduction"],
              ].map(([field, label]) => (
                <label key={field} className="text-xs font-black uppercase tracking-wider text-slate-500">{label}
                  <input type="number" step="0.01" value={entryForm[field] ?? ""} onChange={(e) => setEntryField(field, e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-rose-100 px-3 text-sm font-bold normal-case outline-none" />
                </label>
              ))}
              <label className="md:col-span-2 text-xs font-black uppercase tracking-wider text-slate-500">Notes
                <textarea value={entryForm.notes || ""} onChange={(e) => setEntryField("notes", e.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-rose-100 px-3 py-2 text-sm font-semibold normal-case outline-none" />
              </label>
            </div>
            <div className="grid grid-cols-4 gap-3 border-y border-rose-50 bg-rose-50 p-5 text-sm">
              <div><span className="block text-xs font-bold text-slate-400">Gross</span><b>{money(formTotals.gross)}</b></div>
              <div><span className="block text-xs font-bold text-slate-400">Deductions</span><b>{money(formTotals.deductions)}</b></div>
              <div><span className="block text-xs font-bold text-slate-400">Cash Advance</span><b>{money(formTotals.cashAdvanceDeduction)}</b></div>
              <div><span className="block text-xs font-bold text-slate-400">Net</span><b className="text-[#FC687D]">{money(formTotals.net)}</b></div>
            </div>
            <div className="flex justify-end gap-3 p-5">
              <button type="button" onClick={() => setEntryModalOpen(false)} className="h-11 rounded-xl border border-slate-200 px-5 text-xs font-black uppercase tracking-wider text-slate-500">Cancel</button>
              <button disabled={saving} className="h-11 rounded-xl bg-[#FC687D] px-5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50">{saving ? "Saving..." : "Save Payroll"}</button>
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
    <div className="overflow-x-auto rounded-2xl border border-rose-50 bg-white shadow-sm">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead className="bg-rose-50 text-left text-[10px] uppercase tracking-wider text-rose-700">
          <tr>{headers.map((header, idx) => <th key={header} className={idx === 0 ? "p-3" : ""}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={headers.length} className="p-8 text-center text-sm font-semibold text-slate-400">{empty}</td></tr> : rows}
        </tbody>
      </table>
    </div>
  );
}
