"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Accounts" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/activity", label: "Activity" },
  { href: "/paperwork/forms", label: "Sales forms" },
];

export function AdminTabs() {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Admin">
      {TABS.map((t) => (
        <Link key={t.href} className="tab" href={t.href} aria-current={path === t.href ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
