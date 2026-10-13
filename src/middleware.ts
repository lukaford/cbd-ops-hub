import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { accountForSession } from "@/lib/auth/accounts";
import { ACCOUNT_COOKIE, accountsEnabled } from "@/lib/auth/current";
import { canOpen } from "@/lib/auth/permissions";
import { SESSION_COOKIE, signInRequired, validSession } from "@/lib/session";

// Open to anyone: the sign-in pages and one-time links.
const PUBLIC = ["/login", "/setup", "/invite/", "/portal/sign-in", "/portal/link/"];

function redirectTo(req: NextRequest, pathname: string, keepNext = false) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const next = req.nextUrl.pathname + req.nextUrl.search;
  if (keepNext && next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (PUBLIC.some((p) => path === p || path.startsWith(p))) return NextResponse.next();

  // Before the first account is made, keep the old behavior: open on your own
  // computer, or the shared APP_PASSWORD on a hosted copy.
  if (!(await accountsEnabled())) {
    if (path.startsWith("/portal")) return redirectTo(req, "/portal/sign-in");
    if (!signInRequired() || (await validSession(req.cookies.get(SESSION_COOKIE)?.value))) return NextResponse.next();
    return redirectTo(req, "/login", true);
  }

  const account = await accountForSession(await getDb(), req.cookies.get(ACCOUNT_COOKIE)?.value);
  if (path === "/portal" || path.startsWith("/portal/")) {
    return account?.kind === "client" ? NextResponse.next() : redirectTo(req, "/portal/sign-in");
  }
  if (account?.kind === "client") return redirectTo(req, "/portal");
  if (!account) return redirectTo(req, "/login", true);
  if (!canOpen(account.user, path)) {
    const url = req.nextUrl.clone();
    url.pathname = "/no-access";
    return NextResponse.rewrite(url, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  // Sessions live in the database, so this runs on Node rather than the edge.
  runtime: "nodejs",
  matcher: ["/((?!_next/|favicon.ico|pdf-worker).*)"],
};
