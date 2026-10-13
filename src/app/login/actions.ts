"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { createOwner, endSession, passwordProblem, setPasswordWithToken, signInStaff, STAFF_SESSION_DAYS } from "@/lib/auth/accounts";
import { ACCOUNT_COOKIE, accountsEnabled, requestMeta, setAccountCookie } from "@/lib/auth/current";
import { createSession, passwordMatches, SESSION_COOKIE, SESSION_DAYS, signInRequired } from "@/lib/session";

// Only same-site paths, never another host.
const safeNext = (next: string) => (next.startsWith("/") && !next.startsWith("//") ? next : "/");

export async function signIn(_prev: string | null, form: FormData): Promise<string | null> {
  const next = safeNext(String(form.get("next") ?? ""));
  if (await accountsEnabled()) {
    const meta = await requestMeta();
    const result = await signInStaff(await getDb(), String(form.get("email") ?? ""), String(form.get("password") ?? ""), meta);
    if (!result.ok) return result.error;
    await setAccountCookie(result.session, STAFF_SESSION_DAYS);
    redirect(next);
  }
  // Before accounts exist: the shared password.
  if (!(await passwordMatches(String(form.get("password") ?? "")))) return "That password isn't right.";
  (await cookies()).set(SESSION_COOKIE, await createSession(), {
    httpOnly: true,
    // Secure only over https, so a password-protected copy also works at http://localhost.
    secure: (await headers()).get("x-forwarded-proto") === "https",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  redirect(next);
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  await endSession(await getDb(), jar.get(ACCOUNT_COOKIE)?.value);
  jar.delete(ACCOUNT_COOKIE);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

// First run: make the owner's admin account. On a hosted copy the shared
// password is asked for too, so a stranger can't claim the app first.
export async function setUpOwner(_prev: string | null, form: FormData): Promise<string | null> {
  if (await accountsEnabled()) return "The first account already exists. Sign in instead.";
  if (signInRequired() && !(await passwordMatches(String(form.get("shopPassword") ?? "")))) return "The shop password isn't right.";
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter your name and email.";
  const problem = passwordProblem(password);
  if (problem) return problem;
  const db = await getDb();
  await createOwner(db, { name, email, password });
  const result = await signInStaff(db, email, password, await requestMeta());
  if (!result.ok) return result.error;
  await setAccountCookie(result.session, STAFF_SESSION_DAYS);
  redirect("/admin/users");
}

export async function acceptInvite(_prev: string | null, form: FormData): Promise<string | null> {
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return "The two passwords don't match.";
  const result = await setPasswordWithToken(await getDb(), String(form.get("token") ?? ""), password, await requestMeta());
  if (!result.ok) return result.error;
  await setAccountCookie(result.session, STAFF_SESSION_DAYS);
  redirect("/");
}
