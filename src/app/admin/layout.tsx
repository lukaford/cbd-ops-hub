import { AdminTabs } from "./AdminTabs";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="top">
        <div>
          <div className="label">Closets by Design · Admin</div>
          <h1>Administration</h1>
          <p>Accounts for every employee, the categories that decide what they can do, and a log of who did what.</p>
        </div>
      </header>
      <AdminTabs />
      {children}
    </>
  );
}
