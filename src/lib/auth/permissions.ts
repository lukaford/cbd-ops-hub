// Every action the app checks. Admins build categories (Designer, Front office,
// Production…) out of these on the admin dashboard and put people in them; a
// person can do anything any of their categories allows. Adding a permission
// here is a code change, because the app has to check it somewhere.

export const PERMISSION_AREAS = ["Jobs", "Sales", "Paperwork", "Operations", "Clients", "Admin"] as const;

type Rule = { area: (typeof PERMISSION_AREAS)[number]; label: string };

export const PERMISSIONS = {
  "jobs.view": { area: "Jobs", label: "See the jobs board and schedule" },
  "folders.view": { area: "Jobs", label: "See folder steps from the Manager paste" },
  "reports.view": { area: "Jobs", label: "Run reports and download them" },
  "reports.save": { area: "Jobs", label: "Save report setups for everyone" },
  "manager.import": { area: "Jobs", label: "Paste the Manager Special Orders table" },
  "unsold.view": { area: "Sales", label: "See leads and unsold jobs" },
  "pricebook.view": { area: "Sales", label: "Look up the price book" },
  "paperwork.write": { area: "Paperwork", label: "Start, fill in and submit paperwork" },
  "paperwork.review": { area: "Paperwork", label: "Open and review submitted paperwork" },
  "pricebook.manage": { area: "Paperwork", label: "Upload paperwork templates and price books" },
  "orders.manage": { area: "Operations", label: "Track material and special orders" },
  "production.update": { area: "Operations", label: "Update production steps" },
  "qa.signoff": { area: "Operations", label: "Sign off QA" },
  "install.update": { area: "Operations", label: "Update installs" },
  "jobs.assign": { area: "Sales", label: "Assign designers to jobs (gets asked when a job has none)" },
  "clients.view": { area: "Clients", label: "See clients" },
  "clients.manage": { area: "Clients", label: "Add clients and send them sign-in links" },
  "users.manage": { area: "Admin", label: "Manage accounts and categories" },
  "audit.view": { area: "Admin", label: "See the activity log" },
} satisfies Record<string, Rule>;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}

export type JobScope = "all" | "own";

export const JOB_SCOPES: { key: JobScope; label: string; help: string }[] = [
  { key: "all", label: "Every job", help: "Sees all jobs, leads, paperwork and clients." },
  {
    key: "own",
    label: "Only their own",
    help: "Sees only jobs with their name on them or their photos in JobTread, jobs assigned to them, their clients' jobs, and paperwork they started.",
  },
];

// What a signed-in staff member may do, worked out from their categories.
export interface Access {
  admin: boolean;
  permissions: ReadonlySet<string>;
  // "own" only when none of their categories sees every job.
  scope: JobScope;
}

export function accessFrom(role: string, categories: { permissions: readonly string[]; jobScope: string }[]): Access {
  if (role === "admin") return { admin: true, permissions: new Set(ALL_PERMISSIONS), scope: "all" };
  const permissions = new Set(categories.flatMap((c) => c.permissions));
  const scope: JobScope = categories.length && categories.every((c) => c.jobScope === "own") ? "own" : "all";
  return { admin: false, permissions, scope };
}

export function can(access: Access | null | undefined, permission: Permission): boolean {
  return Boolean(access && (access.admin || access.permissions.has(permission)));
}

// What a staff page needs (any one of the listed permissions); anything not listed needs "jobs.view".
const ROUTES: [prefix: string, anyOf: Permission[]][] = [
  ["/admin/activity", ["audit.view"]],
  ["/admin", ["users.manage"]],
  ["/clients", ["clients.view", "clients.manage"]],
  ["/import", ["manager.import"]],
  ["/assign", ["jobs.assign"]],
  ["/alerts", []],
  ["/unsold", ["unsold.view"]],
  ["/reports", ["reports.view"]],
  ["/folders", ["folders.view"]],
  // The editors load blank forms from here, so whoever fills paperwork can read them.
  ["/paperwork/templates/", ["pricebook.manage", "paperwork.write", "paperwork.review"]],
  ["/paperwork/templates", ["pricebook.manage"]],
  ["/paperwork", ["paperwork.write", "paperwork.review"]],
  ["/catalog", ["pricebook.view", "pricebook.manage"]],
  ["/no-access", []],
];

export function permissionsForPath(pathname: string): Permission[] {
  for (const [prefix, anyOf] of ROUTES) {
    if (prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(prefix + "/")) return anyOf;
  }
  return ["jobs.view"];
}

export function canOpen(access: Access | null | undefined, pathname: string): boolean {
  const anyOf = permissionsForPath(pathname);
  return anyOf.length === 0 || anyOf.some((p) => can(access, p));
}

// Starting categories, made along with the first admin account. Admins can
// rename, change or delete them and add more.
export const DEFAULT_CATEGORIES: { name: string; description: string; jobScope: JobScope; permissions: Permission[] }[] = [
  {
    name: "Manager",
    description: "Sees and does everything except accounts.",
    jobScope: "all",
    permissions: ALL_PERMISSIONS.filter((p) => p !== "users.manage"),
  },
  {
    name: "Designer",
    description: "In-home sales: their own leads, jobs, paperwork and clients.",
    jobScope: "own",
    permissions: ["jobs.view", "unsold.view", "pricebook.view", "paperwork.write", "clients.view", "clients.manage"],
  },
  {
    name: "Sales office",
    description: "Leads, clients and the price book for every job.",
    jobScope: "all",
    permissions: ["jobs.view", "reports.view", "unsold.view", "pricebook.view", "clients.view", "clients.manage"],
  },
  {
    name: "Front office",
    description: "Manager pastes, scheduling, paperwork review and clients.",
    jobScope: "all",
    permissions: [
      "jobs.view",
      "folders.view",
      "reports.view",
      "reports.save",
      "manager.import",
      "unsold.view",
      "pricebook.view",
      "paperwork.review",
      "install.update",
      "clients.view",
      "clients.manage",
    ],
  },
  {
    name: "Front office manager",
    description: "Front office, plus is asked to name the designer when a job has none.",
    jobScope: "all",
    permissions: [
      "jobs.view",
      "folders.view",
      "reports.view",
      "reports.save",
      "manager.import",
      "unsold.view",
      "pricebook.view",
      "paperwork.review",
      "install.update",
      "clients.view",
      "clients.manage",
      "jobs.assign",
      "audit.view",
    ],
  },
  { name: "Engineering CAD", description: "", jobScope: "all", permissions: ["jobs.view", "folders.view", "reports.view", "paperwork.review"] },
  { name: "Purchasing", description: "", jobScope: "all", permissions: ["jobs.view", "folders.view", "reports.view", "pricebook.view", "orders.manage"] },
  {
    name: "Price verification",
    description: "",
    jobScope: "all",
    permissions: ["jobs.view", "folders.view", "reports.view", "pricebook.view", "paperwork.review", "pricebook.manage"],
  },
  { name: "QA", description: "", jobScope: "all", permissions: ["jobs.view", "folders.view", "reports.view", "qa.signoff"] },
  { name: "Production", description: "", jobScope: "all", permissions: ["jobs.view", "folders.view", "reports.view", "production.update"] },
  { name: "Installation", description: "", jobScope: "all", permissions: ["jobs.view", "folders.view", "reports.view", "install.update"] },
];
