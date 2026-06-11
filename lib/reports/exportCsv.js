"use client";

function escapeCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportReportToCSV(rows, filename, headers = null) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const keys = headers || Object.keys(safeRows[0] || {});
  const lines = [
    keys.map((header) => escapeCell(header.label || header)).join(","),
    ...safeRows.map((row) =>
      keys
        .map((header) => {
          const key = header.key || header;
          return escapeCell(row[key]);
        })
        .join(",")
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
