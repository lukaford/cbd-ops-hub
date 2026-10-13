import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { accountsEnabled, currentAccount } from "@/lib/auth/current";
import { can, canOpen } from "@/lib/auth/permissions";
import { SESSION_COOKIE, validSession } from "@/lib/session";
import { signOut } from "./login/actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "Install Readiness Board",
  description: "Every sold job by firm install date, read from JobTread, with folder detail from the Manager Special Orders table.",
};

const STAFF_LINKS = [
  { href: "/", label: "Jobs" },
  { href: "/schedule", label: "Schedule" },
  { href: "/reports", label: "Reports" },
  { href: "/unsold", label: "Unsold" },
  { href: "/paperwork", label: "Paperwork" },
  { href: "/folders", label: "Folders" },
  { href: "/import", label: "Paste Special Orders" },
  { href: "/clients", label: "Clients" },
  { href: "/admin/users", label: "Staff" },
];

async function Nav() {
  const signOutButton = (
    <form action={signOut}>
      <button className="link" type="submit">Sign out</button>
    </form>
  );
  if (!(await accountsEnabled())) {
    // Before the first account: everything shows, as it always has.
    const signedIn = await validSession((await cookies()).get(SESSION_COOKIE)?.value);
    return (
      <>
        {STAFF_LINKS.map((l) => (
          <Link key={l.href} href={l.href}>{l.label}</Link>
        ))}
        {signedIn && signOutButton}
      </>
    );
  }
  const account = await currentAccount();
  if (account?.kind === "client") {
    return (
      <>
        <Link href="/portal">My project</Link>
        <span className="who">{account.client.name}</span>
        {signOutButton}
      </>
    );
  }
  if (!account) return null;
  const user = account.user;
  return (
    <>
      {STAFF_LINKS.filter((l) => canOpen(user, l.href)).map((l) => (
        <Link key={l.href} href={l.href}>{l.label}</Link>
      ))}
      <span className="who">{user.name}{can(user, "users.manage") ? " · admin" : ""}</span>
      {signOutButton}
    </>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
          <Nav />
        </nav>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
