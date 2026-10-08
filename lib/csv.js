// CSV for the report downloads. Cells that a spreadsheet would read as a formula
// (starting with = + - @ or a control character) are prefixed with an apostrophe,
// so a creative named "=HYPERLINK(...)" cannot run anything on the advertiser's machine.

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value) {
  if (value === null || value === undefined) return "";
  let text = typeof value === "number" ? String(value) : String(value);
  if (typeof value !== "number" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Header row plus data rows, CRLF line endings, a UTF-8 BOM so Excel reads accents. */
export function toCsv(headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
