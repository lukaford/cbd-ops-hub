"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { CLIENT_SESSION_DAYS, clientLoginLink, findClientByEmail, signInClientWithToken } from "@/lib/auth/accounts";
import { requestMeta, setAccountCookie } from "@/lib/auth/current";
import type { ActionResult } from "@/components/ActionForm";
import { emailEnabled, sendEmail } from "@/lib/email";

// The answer is the same whether or not the email is on file, so the form
// can't be used to find out who is a customer.
export async function emailMeALink(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!emailEnabled()) return { error: "Sign-in by email isn't set up yet. Ask your designer for a sign-in link." };
  const db = await getDb();
  const client = await findClientByEmail(db, String(form.get("email") ?? ""));
  if (client?.email) {
    const link = `${(await requestMeta()).linkOrigin}/portal/link/${await clientLoginLink(db, client.id, null)}`;
    await sendEmail(client.email, "Your Closets by Design sign-in link", `Hi ${client.name},\n\nOpen your project here (the link works once, for 3 days):\n${link}\n`);
  }
  return { message: "If that email is on file, a sign-in link is on its way. Check your inbox." };
}

// The link page asks for a tap first, so email scanners that open links don't use it up.
export async function openClientLink(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const result = await signInClientWithToken(await getDb(), String(form.get("token") ?? ""), await requestMeta());
  if (!result) return { error: "This link has expired or was already used. Ask your designer for a new one." };
  await setAccountCookie(result.session, CLIENT_SESSION_DAYS);
  redirect("/portal");
}
