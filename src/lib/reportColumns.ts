import type { BoardJob } from "./jobBoard";
import { materialLabel } from "./jobtread/fields";

export interface Column {
  key: string;
  label: string;
  value: (j: BoardJob) => string;
}

const md = (iso: string | null) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8))}/${iso.slice(2, 4)}` : "");

export const COLUMNS: Column[] = [
  { key: "install", label: "Install date", value: (j) => md(j.installOn) },
  { key: "job", label: "Job #", value: (j) => j.jobNumber },
  { key: "customer", label: "Customer", value: (j) => j.customer || j.name },
  { key: "city", label: "City", value: (j) => j.city },
  { key: "stage", label: "Status 2.0", value: (j) => j.stage ?? "" },
  { key: "since", label: "In stage since", value: (j) => (j.stageSince ? md(j.stageSince.toISOString().slice(0, 10)) : "") },
  { key: "materials", label: "Materials", value: (j) => j.materials.map(materialLabel).join(", ") },
  { key: "orderBy", label: "Order by", value: (j) => md(j.orderBy) },
  { key: "ordered", label: "All materials ordered", value: (j) => (j.materialsOrdered === null ? "" : j.materialsOrdered ? "Yes" : "No") },
  { key: "cnc", label: "CNC cut", value: (j) => md(j.production[0]?.on ?? null) },
  { key: "edge", label: "Edge banding", value: (j) => md(j.production[1]?.on ?? null) },
  { key: "drawer", label: "Drawer assembly", value: (j) => md(j.production[2]?.on ?? null) },
  { key: "qa", label: "Final QA", value: (j) => md(j.production[3]?.on ?? null) },
  { key: "jobName", label: "JobTread name", value: (j) => j.name },
];

export const DEFAULT_COLUMNS = ["install", "job", "customer", "stage", "materials", "ordered"];

export function pickColumns(keys: string[]): Column[] {
  const chosen = COLUMNS.filter((c) => keys.includes(c.key));
  return chosen.length ? chosen : COLUMNS.filter((c) => DEFAULT_COLUMNS.includes(c.key));
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(jobs: BoardJob[], cols: Column[]): string {
  return [cols.map((c) => csvCell(c.label)).join(","), ...jobs.map((j) => cols.map((c) => csvCell(c.value(j))).join(","))].join("\r\n");
}
