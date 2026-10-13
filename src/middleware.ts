import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, signInRequired, validSession } from "@/lib/session";

export async function middleware(req: NextRequest) {
  if (!signInRequired()) return NextResponse.next();
  if (await validSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const next = req.nextUrl.pathname + req.nextUrl.search;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|_next/|favicon.ico).*)"],
};
