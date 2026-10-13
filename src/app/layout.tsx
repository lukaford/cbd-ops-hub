import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE, validSession } from "@/lib/session";
import { signOut } from "./login/actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "Install Readiness Board",
  description: "Every sold job by firm install date, read from JobTread, with folder detail from the Manager Special Orders table.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const signedIn = await validSession((await cookies()).get(SESSION_COOKIE)?.value);
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <nav className="nav">
          <span className="brand">CBD Ops Hub</span>
          <Link href="/">Jobs</Link>
          <Link href="/schedule">Schedule</Link>
          <Link href="/reports">Reports</Link>
          <Link href="/unsold">Unsold</Link>
          <Link href="/folders">Folders</Link>
          <Link href="/import">Paste Special Orders</Link>
          {signedIn && (
            <form action={signOut}>
              <button className="link" type="submit">Sign out</button>
            </form>
          )}
        </nav>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
