const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Manila",
});

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Manila",
});

function pad(value) {
  return String(value).padStart(2, "0");
}

function coerceDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value, fallback = "-") {
  const date = coerceDate(value);
  if (!date) return fallback;
  const parts = Object.fromEntries(dateFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${MONTHS[Number(parts.month) - 1]}-${pad(parts.day)}`;
}

export function formatDateTime(value, fallback = "-") {
  const date = coerceDate(value);
  if (!date) return fallback;
  return `${formatDate(date, fallback)} ${timeFormatter.format(date)}`;
}

export function formatDateRange(start, end, fallback = "-") {
  return `${formatDate(start, fallback)} - ${formatDate(end, fallback)}`;
}
