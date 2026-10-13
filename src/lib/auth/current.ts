import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { accountForSession, countUsers, ownJobNumbers, type Account, type StaffUser } from "./accounts";
import { can, type Access, type Permission } from "./permissions";

export const ACCOUNT_COOKIE = "hub_account";

// Once the first account exists the app is in accounts mode for good, so cache that.
let accountsOn = false;
export async function accountsEnabled(): Promise<boolean> {
  if (!accountsOn) accountsOn = (await countUsers(await getDb())) > 0;
  return accountsOn;
}

export const currentAccount = cache(async (): Promise<Account | null> => {
  return accountForSession(await getDb(), (await cookies()).get(ACCOUNT_COOKIE)?.value);
});

export type Staff = { user: StaffUser; access: Access };

export async function currentStaff(): Promise<Staff | null> {
  const account = await currentAccount();
  return account?.kind === "staff" ? { user: account.user, access: account.access } : null;
}

// Job numbers the signed-in person may see, or null for every job (also before
// accounts are turned on).
export const visibleJobs = cache(async (): Promise<Set<string> | null> => {
  if (!(await accountsEnabled())) return null;
  const staff = await currentStaff();
  if (!staff) return new Set();
  return staff.access.scope === "all" ? null : ownJobNumbers(await getDb(), staff.user);
});

export function inScope(scope: Set<string> | null, jobNumber: string): boolean {
  return scope === null || scope.has(jobNumber);
}

// For server actions and routes: the page gate already ran, but actions can be
// called directly, so they check again. Before any account exists everyone passes.
export async function requireStaff(permission: Permission): Promise<Staff | null> {
  if (!(await accountsEnabled())) return null;
  const staff = await currentStaff();
  if (!staff) redirect("/login");
  if (!can(staff.access, permission)) throw new Error("You don't have access to do that.");
  return staff;
}

export async function requestMeta() {
  const h = await headers();
  return {
    ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim(),
    userAgent: h.get("user-agent") ?? "",
    https: h.get("x-forwarded-proto") === "https",
    origin: `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`,
  };
}

export async function setAccountCookie(token: string, days: number) {
  const { https } = await requestMeta();
  (await cookies()).set(ACCOUNT_COOKIE, token, {
    httpOnly: true,
    // Secure only over https, so the app also works at http://localhost.
    secure: https,
    sameSite: "lax",
    path: "/",
    maxAge: days * 86400,
  });
}
