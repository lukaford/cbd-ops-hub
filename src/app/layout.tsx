import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Install Readiness Board",
  description: "Every sold job by firm install date, read from JobTread, with folder detail from the Manager Special Orders table.",
};

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
          <Link href="/">Jobs</Link>
          <Link href="/folders">Folders</Link>
          <Link href="/import">Paste Special Orders</Link>
        </nav>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
