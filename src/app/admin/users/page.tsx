import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { jobAssignments, userCategories, users } from "@/db/schema";
import { ActionForm } from "@/components/ActionForm";
import { listCategories, type Category, type StaffUser } from "@/lib/auth/accounts";
import { requireStaff } from "@/lib/auth/current";
import { addUser, resetLink, saveUser } from "../actions";

export const dynamic = "force-dynamic";

function StaffFields({ categories, user, memberOf = [], jobs = [] }: { categories: Category[]; user?: StaffUser; memberOf?: number[]; jobs?: string[] }) {
  return (
    <>
      <div className="formgrid">
        <label>
          <span className="label">Name</span>
          <input type="text" name="name" defaultValue={user?.name} required />
        </label>
        <label>
          <span className="label">Email</span>
          <input type="email" name="email" defaultValue={user?.email} required />
        </label>
        <label>
          <span className="label">Initials (as in Manager)</span>
          <input type="text" name="initials" defaultValue={user?.initials} maxLength={4} />
        </label>
        <label>
          <span className="label">Account type</span>
          <select name="role" defaultValue={user?.role ?? "staff"}>
            <option value="staff">Staff: what their categories allow</option>
            <option value="admin">Admin: everything, including accounts</option>
          </select>
        </label>
      </div>
      <fieldset className="checks" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Categories</legend>
        {categories.map((c) => (
          <label key={c.id} title={c.description}>
            <input type="checkbox" name="categories" value={c.id} defaultChecked={memberOf.includes(c.id)} /> {c.name}
            {c.jobScope === "own" && <span className="small">(own work)</span>}
          </label>
        ))}
      </fieldset>
      <div className="formgrid">
        <label>
          <span className="label">Name as written on jobs</span>
          <input type="text" name="jobNames" defaultValue={user?.jobNames.join(", ")} placeholder="e.g. Sam D, Samantha" />
          <span className="small">Jobs with this designer name in Manager, or photos they uploaded in JobTread, count as theirs. Use their JobTread name; separate spellings with commas.</span>
        </label>
        <label>
          <span className="label">Extra jobs that are theirs</span>
          <input type="text" name="jobs" defaultValue={jobs.join(", ")} placeholder="Job numbers, e.g. 64410, 64412" />
          <span className="small">For leads and jobs their name isn&apos;t on yet.</span>
        </label>
      </div>
      {user && (
        <label className="checks">
          <input type="checkbox" name="active" defaultChecked={user.active} /> Account on (switching it off signs them out everywhere)
        </label>
      )}
    </>
  );
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const me = await requireStaff("users.manage");
  const { category } = await searchParams;
  const db = await getDb();
  const [people, categories, memberships, assignments] = await Promise.all([
    db.select().from(users).orderBy(desc(users.active), asc(users.name)),
    listCategories(db),
    db.select().from(userCategories),
    db.select().from(jobAssignments).orderBy(asc(jobAssignments.jobNumber)),
  ]);
  const catsOf = new Map<number, number[]>();
  for (const m of memberships) catsOf.set(m.userId, [...(catsOf.get(m.userId) ?? []), m.categoryId]);
  const jobsOf = new Map<number, string[]>();
  for (const a of assignments) jobsOf.set(a.userId, [...(jobsOf.get(a.userId) ?? []), a.jobNumber]);
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  const filters = [
    { key: "", label: "Everyone", match: () => true },
    { key: "admin", label: "Admins", match: (u: StaffUser) => u.role === "admin" },
    ...categories.map((c) => ({ key: String(c.id), label: c.name, match: (u: StaffUser) => (catsOf.get(u.id) ?? []).includes(c.id) })),
    { key: "pending", label: "Invite not accepted", match: (u: StaffUser) => u.active && !u.passwordHash },
    { key: "off", label: "Switched off", match: (u: StaffUser) => !u.active },
  ];
  const current = filters.find((f) => f.key === (category ?? "")) ?? filters[0];
  const list = people.filter(current.match);

  return (
    <>
      <section>
        <h2>Add an employee</h2>
        <ActionForm action={addUser} submit="Create account and invite link">
          <StaffFields categories={categories} />
        </ActionForm>
      </section>

      <section>
        <h2>Accounts</h2>
        <nav className="tabs" aria-label="Filter by category">
          {filters.map((f) => {
            const n = people.filter(f.match).length;
            if (n === 0 && f.key !== "" && f.key !== current.key) return null;
            return (
              <Link key={f.key} className="tab" href={f.key ? `/admin/users?category=${f.key}` : "/admin/users"} aria-current={f === current ? "page" : undefined}>
                {f.label} <span className="num">{n}</span>
              </Link>
            );
          })}
        </nav>
        <div className="tablewrap" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Categories</th>
                <th>Last sign-in</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty">Nobody here yet.</td>
                </tr>
              )}
              {list.map((u) => (
                <tr key={u.id} style={u.active ? undefined : { opacity: 0.55 }}>
                  <td>
                    <div className="cust">
                      {u.name} {u.initials && <span className="small mono">{u.initials}</span>}
                    </div>
                    <div className="small">{u.email}</div>
                    {!u.active && <span className="pill plain">Off</span>}
                    {!u.passwordHash && u.active && <span className="pill warn">Invite not accepted</span>}
                  </td>
                  <td>{u.role === "admin" ? <strong>Admin</strong> : (catsOf.get(u.id) ?? []).map((id) => catName.get(id)).join(", ") || "—"}</td>
                  <td className="small">{u.lastSignInAt ? u.lastSignInAt.toLocaleDateString("en-US") : "Never"}</td>
                  <td>
                    <details className="edit">
                      <summary>Edit</summary>
                      <ActionForm action={saveUser} submit="Save">
                        <input type="hidden" name="id" value={u.id} />
                        <StaffFields categories={categories} user={u} memberOf={catsOf.get(u.id)} jobs={jobsOf.get(u.id)} />
                      </ActionForm>
                      {u.id !== me?.user.id && (
                        <ActionForm action={resetLink} submit={u.passwordHash ? "Make a password reset link" : "Make a new invite link"}>
                          <input type="hidden" name="id" value={u.id} />
                        </ActionForm>
                      )}
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
