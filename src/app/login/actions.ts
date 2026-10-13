"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, passwordMatches, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";

export async function signIn(_prev: string | null, form: FormData): Promise<string | null> {
  if (!(await passwordMatches(String(form.get("password") ?? "")))) return "That password isn't right.";
  (await cookies()).set(SESSION_COOKIE, await createSession(), {
    httpOnly: true,
    // Secure only over https, so a password-protected copy also works at http://localhost.
    secure: (await headers()).get("x-forwarded-proto") === "https",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  const next = String(form.get("next") ?? "");
  // Only same-site paths, never another host.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
