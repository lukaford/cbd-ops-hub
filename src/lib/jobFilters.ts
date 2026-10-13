import type { BoardJob } from "./jobBoard";
import { MATERIALS, STAGES, COMPLETE } from "./jobtread/fields";

// One set of filters and sorts shared by the board, the schedule, reports and CSV.
export type When = "upcoming" | "past" | "all";
export type SortKey = "install" | "install-desc" | "job" | "customer" | "stage";

export interface JobQuery {
  when: When;
  from: string | null; // install date range, inclusive
  to: string | null;
  materials: string[]; // job has any of these
  stages: string[];
  ordered: "any" | "yes" | "no";
  q: string;
  sort: SortKey;
}

export const SORTS: { key: SortKey; label: string }[] = [
  { key: "install", label: "Install date, soonest first" },
  { key: "install-desc", label: "Install date, latest first" },
  { key: "job", label: "Job #" },
  { key: "customer", label: "Customer" },
  { key: "stage", label: "Status 2.0 stage" },
];

type Params = Record<string, string | string[] | undefined>;

function list(v: string | string[] | undefined): string[] {
  return (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => x.split(",")).filter(Boolean);
}

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function parseJobQuery(p: Params, defaults: Partial<JobQuery> = {}): JobQuery {
  const when = one(p.when);
  const sort = one(p.sort);
  const ordered = one(p.ordered);
  return {
    when: when === "past" || when === "all" || when === "upcoming" ? when : (defaults.when ?? "upcoming"),
    from: ISO.test(one(p.from)) ? one(p.from) : (defaults.from ?? null),
    to: ISO.test(one(p.to)) ? one(p.to) : (defaults.to ?? null),
    materials: list(p.material).filter((m) => MATERIALS.includes(m)),
    stages: list(p.stage).filter((s) => s === COMPLETE || s === "none" || STAGES.some((x) => x.name === s)),
    ordered: ordered === "yes" || ordered === "no" ? ordered : "any",
    q: one(p.q).trim().toLowerCase(),
    sort: SORTS.some((s) => s.key === sort) ? (sort as SortKey) : (defaults.sort ?? (when === "past" ? "install-desc" : "install")),
  };
}

export function matchesQuery(j: BoardJob, f: JobQuery): boolean {
  if (f.when === "upcoming" && j.past) return false;
  if (f.when === "past" && !j.past) return false;
  if ((f.from || f.to) && !j.installOn) return false;
  if (f.from && j.installOn! < f.from) return false;
  if (f.to && j.installOn! > f.to) return false;
  if (f.materials.length && !j.materials.some((m) => f.materials.includes(m))) return false;
  if (f.stages.length && !f.stages.includes(j.stage ?? "none")) return false;
  if (f.ordered === "yes" && j.materialsOrdered !== true) return false;
  if (f.ordered === "no" && j.materialsOrdered === true) return false;
  if (f.q && ![j.customer, j.jobNumber, j.name, j.city].join(" ").toLowerCase().includes(f.q)) return false;
  return true;
}

const stageRank = (s: string | null) => (s === COMPLETE ? 99 : s === null ? -1 : STAGES.findIndex((x) => x.name === s));

export function sortJobs(jobs: BoardJob[], sort: SortKey): BoardJob[] {
  const byInstall = (a: BoardJob, b: BoardJob) => (a.installOn ?? "9999").localeCompare(b.installOn ?? "9999");
  const cmp: Record<SortKey, (a: BoardJob, b: BoardJob) => number> = {
    install: byInstall,
    "install-desc": (a, b) => (b.installOn ?? "").localeCompare(a.installOn ?? ""),
    job: (a, b) => a.jobNumber.localeCompare(b.jobNumber, undefined, { numeric: true }),
    customer: (a, b) => a.customer.localeCompare(b.customer),
    stage: (a, b) => stageRank(a.stage) - stageRank(b.stage) || byInstall(a, b),
  };
  return [...jobs].sort(cmp[sort]);
}

export function queryJobs(jobs: BoardJob[], f: JobQuery): BoardJob[] {
  return sortJobs(jobs.filter((j) => matchesQuery(j, f)), f.sort);
}

// Turns a query back into URL params, leaving out defaults.
export function queryParams(f: Partial<JobQuery>): URLSearchParams {
  const p = new URLSearchParams();
  if (f.when && f.when !== "upcoming") p.set("when", f.when);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  for (const m of f.materials ?? []) p.append("material", m);
  for (const s of f.stages ?? []) p.append("stage", s);
  if (f.ordered && f.ordered !== "any") p.set("ordered", f.ordered);
  if (f.q) p.set("q", f.q);
  if (f.sort) p.set("sort", f.sort);
  return p;
}
