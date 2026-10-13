// Who may do what. Admins and managers can do everything (only admins manage
// accounts); staff get the shared basics plus what their departments need.
// Kept in code rather than the database so a policy change is a reviewed edit.

export const DEPARTMENTS = [
  { key: "designer", label: "Designer (in-home sales)" },
  { key: "sales", label: "Sales office" },
  { key: "front_office", label: "Front office" },
  { key: "engineering", label: "Engineering CAD" },
  { key: "purchasing", label: "Purchasing" },
  { key: "price_verification", label: "Price verification" },
  { key: "qa", label: "QA" },
  { key: "production", label: "Production" },
  { key: "installation", label: "Installation" },
] as const;

export type Department = (typeof DEPARTMENTS)[number]["key"];

export const ROLES = [
  { key: "admin", label: "Admin", help: "Everything, including staff accounts." },
  { key: "manager", label: "Manager", help: "Everything except staff accounts." },
  { key: "staff", label: "Staff", help: "The shared views plus their departments' work." },
] as const;

export type Role = (typeof ROLES)[number]["key"];

type Rule = { label: string; everyone?: true; departments?: Department[]; adminOnly?: true };

export const PERMISSIONS = {
  "jobs.view": { label: "See the jobs board, folders and schedule", everyone: true },
  "reports.view": { label: "Run and download reports", everyone: true },
  "reports.save": { label: "Save shared report setups", departments: ["front_office"] },
  "unsold.view": { label: "See unsold jobs and leads", departments: ["designer", "sales", "front_office"] },
  "manager.import": { label: "Paste the Manager Special Orders table", departments: ["front_office"] },
  "paperwork.write": { label: "Fill in and submit sales paperwork", departments: ["designer"] },
  "paperwork.review": { label: "Review submitted paperwork", departments: ["front_office", "engineering", "price_verification"] },
  "pricebook.view": { label: "Look up the price book", departments: ["designer", "sales", "front_office", "purchasing", "price_verification"] },
  "pricebook.manage": { label: "Upload price books and paperwork templates", departments: ["price_verification"] },
  "orders.manage": { label: "Track material and special orders", departments: ["purchasing"] },
  "qa.signoff": { label: "Sign off QA", departments: ["qa"] },
  "production.update": { label: "Update production steps", departments: ["production"] },
  "install.update": { label: "Update installs", departments: ["installation", "front_office"] },
  "clients.manage": { label: "Add clients and send them sign-in links", departments: ["designer", "sales", "front_office"] },
  "users.manage": { label: "Add staff and change their access", adminOnly: true },
} satisfies Record<string, Rule>;

export type Permission = keyof typeof PERMISSIONS;

export type StaffAccess = { role: string; departments: readonly string[] };

export function can(user: StaffAccess | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  const rule: Rule = PERMISSIONS[permission];
  if (user.role === "admin") return true;
  if (rule.adminOnly) return false;
  if (user.role === "manager" || rule.everyone) return true;
  return (rule.departments ?? []).some((d) => user.departments.includes(d));
}

export function isRole(value: string): value is Role {
  return ROLES.some((r) => r.key === value);
}

export function isDepartment(value: string): value is Department {
  return DEPARTMENTS.some((d) => d.key === value);
}

// What a staff page needs (any one of the listed permissions); anything not listed needs "jobs.view".
const ROUTES: [prefix: string, anyOf: Permission[]][] = [
  ["/admin", ["users.manage"]],
  ["/clients", ["clients.manage"]],
  ["/import", ["manager.import"]],
  ["/unsold", ["unsold.view"]],
  ["/reports", ["reports.view"]],
  // The editors load blank forms from here, so whoever fills paperwork can read them.
  ["/paperwork/templates/", ["pricebook.manage", "paperwork.write", "paperwork.review"]],
  ["/paperwork/templates", ["pricebook.manage"]],
  ["/paperwork", ["paperwork.write", "paperwork.review"]],
  ["/catalog", ["pricebook.view", "pricebook.manage"]],
];

export function permissionsForPath(pathname: string): Permission[] {
  for (const [prefix, anyOf] of ROUTES) {
    if (prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(prefix + "/")) return anyOf;
  }
  return ["jobs.view"];
}

export function canOpen(user: StaffAccess | null | undefined, pathname: string): boolean {
  return permissionsForPath(pathname).some((p) => can(user, p));
}
