// Shows a cell value the way Excel would for the handful of number formats the
// work sheets use: currency, plain numbers, percentages and dates.

import type { Value } from "./formula";

export function isDateFormat(fmt: string | undefined): boolean {
  if (!fmt) return false;
  const bare = fmt.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
  return /[dmy]/i.test(bare) && !/[0#]/.test(bare);
}

function section(fmt: string, v: number): string | undefined {
  const parts = fmt.split(";");
  if (v > 0 || parts.length === 1) return parts[0];
  if (v < 0) return parts[1] ?? parts[0];
  return parts[2] ?? parts[0];
}

export function formatValue(v: Value, fmt?: string): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "string") return v;
  if (!Number.isFinite(v)) return "";
  if (!fmt) return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  if (isDateFormat(fmt)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(-2)}`;
  }
  const part = section(fmt, v);
  if (part === undefined || part.trim() === "") return "";
  const bare = part.replace(/\[[^\]]*\]/g, "").replace(/_./g, "").replace(/\*./g, "");
  const decimals = /\.(0+)/.exec(bare)?.[1].length ?? 0;
  const pct = bare.includes("%");
  const n = Math.abs(pct ? v * 100 : v);
  const grouped = bare.includes(",");
  let body = n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
  if (pct) body += "%";
  const currency = bare.includes("$");
  if (currency) body = "$" + body;
  // A separate negative section (often red, sometimes in brackets) carries its own sign.
  const negSection = fmt.split(";").length > 1 && v < 0;
  if (v < 0 && !negSection) body = "-" + body;
  if (negSection && bare.includes("(")) body = `(${body})`;
  else if (negSection && bare.includes("-")) body = "-" + body;
  else if (negSection) body = "-" + body;
  return body;
}

// What a designer typed into a work sheet cell, read the way Excel would:
// numbers (with or without $ and commas) become numbers, dates become date serials.
export function coerceInput(raw: string, fmt?: string): Value {
  const s = raw.trim();
  if (!s) return null;
  if (isDateFormat(fmt)) {
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    const us = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(s);
    let d: number | undefined;
    if (iso) d = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    else if (us) {
      const y = us[3] ? (us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3])) : new Date().getFullYear();
      d = Date.UTC(y, Number(us[1]) - 1, Number(us[2]));
    }
    if (d !== undefined) return Math.round((d - Date.UTC(1899, 11, 30)) / 86400000);
  }
  if (fmt === "@") return s;
  const n = s.replace(/[$,\s]/g, "");
  if (/^-?\d*\.?\d+%$/.test(n)) return Number(n.slice(0, -1)) / 100;
  if (/^-?\d*\.?\d+$/.test(n)) return Number(n);
  return s;
}
