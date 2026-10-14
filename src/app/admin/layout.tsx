import Link from "next/link";
import { accountsEnabled } from "@/lib/auth/current";
import { AdminTabs } from "./AdminTabs";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Employees, categories and invites all hang off the owner account, so until it
  // exists these pages would only fail. Point to setup instead.
  const ready = await accountsEnabled();
  return (
    <>
      <header className="top">
        <div>
          <div className="label">Closets by Design · Admin</div>
          <h1>Administration</h1>
          <p>Accounts for every employee, the categories that decide what they can do, and a log of who did what.</p>
        </div>
      </header>
      {ready ? (
        <>
          <AdminTabs />
          {children}
        </>
      ) : (
        <section className="panel">
          <h2>Create your admin account first</h2>
          <p>
            There are no accounts yet, so the app is open to anyone on this computer. Make your own admin account to start adding employees. From then on
            everyone signs in, and each person sees only what their categories allow.
          </p>
          <Link className="btn primary" href="/setup">
            Create my admin account
          </Link>
        </section>
      )}
    </>
  );
}
