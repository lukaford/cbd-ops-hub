import { asc, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ActionForm } from "@/components/ActionForm";
import { requireStaff } from "@/lib/auth/current";
import { can, DEPARTMENTS, PERMISSIONS, ROLES, type Permission } from "@/lib/auth/permissions";
import { addUser, resetLink, saveUser } from "./actions";

export const dynamic = "force-dynamic";

const deptLabel = new Map<string, string>(DEPARTMENTS.map((d) => [d.key, d.label]));
const roleLabel = new Map<string, string>(ROLES.map((r) => [r.key, r.label]));

function StaffFields({ user }: { user?: typeof users.$inferSelect }) {
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
          <span className="label">Role</span>
          <select name="role" defaultValue={user?.role ?? "staff"}>
            {ROLES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}: {r.help}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="checks" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Departments</legend>
        {DEPARTMENTS.map((d) => (
          <label key={d.key}>
            <input type="checkbox" name="departments" value={d.key} defaultChecked={user?.departments.includes(d.key)} /> {d.label}
          </label>
        ))}
      </fieldset>
      {user && (
        <label className="checks">
          <input type="checkbox" name="active" defaultChecked={user.active} /> Account on (switching it off signs them out everywhere)
        </label>
      )}
    </>
  );
}

export default async function UsersPage() {
  const me = await requireStaff("users.manage");
  const list = await (await getDb()).select().from(users).orderBy(desc(users.active), asc(users.name));
  return (
    <>
      <header className="top">
        <div>
          <div className="label">Admin</div>
          <h1>Staff accounts</h1>
          <p>Everyone signs in with their own email and password. What they can open depends on their role and departments (table below).</p>
        </div>
      </header>

      <section>
        <h2>Add someone</h2>
        <ActionForm action={addUser} submit="Create account and invite link">
          <StaffFields />
        </ActionForm>
      </section>

      <section>
        <h2>Everyone ({list.length})</h2>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Departments</th>
                <th>Last sign-in</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} style={u.active ? undefined : { opacity: 0.55 }}>
                  <td>
                    <div className="cust">{u.name} {u.initials && <span className="small mono">{u.initials}</span>}</div>
                    <div className="small">{u.email}</div>
                    {!u.active && <span className="pill plain">Off</span>}
                    {!u.passwordHash && u.active && <span className="pill warn">Invite not accepted</span>}
                  </td>
                  <td>{roleLabel.get(u.role) ?? u.role}</td>
                  <td>{u.departments.map((d) => deptLabel.get(d) ?? d).join(", ") || "—"}</td>
                  <td className="small">{u.lastSignInAt ? u.lastSignInAt.toLocaleDateString("en-US") : "Never"}</td>
                  <td>
                    <details className="edit">
                      <summary>Edit</summary>
                      <ActionForm action={saveUser} submit="Save">
                        <input type="hidden" name="id" value={u.id} />
                        <StaffFields user={u} />
                      </ActionForm>
                      {u.id !== me?.id && (
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

      <section>
        <h2>Who can do what</h2>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Permission</th>
                {DEPARTMENTS.map((d) => (
                  <th key={d.key} className="small">{d.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(PERMISSIONS) as Permission[]).map((p) => (
                <tr key={p}>
                  <td>{PERMISSIONS[p].label}</td>
                  {DEPARTMENTS.map((d) => (
                    <td key={d.key}>{can({ role: "staff", departments: [d.key] }, p) ? "✓" : ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small">Managers can do everything except manage staff accounts. Admins can do everything.</p>
      </section>
    </>
  );
}
