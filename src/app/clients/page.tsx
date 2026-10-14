import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientJobs, clients, users } from "@/db/schema";
import { ActionForm } from "@/components/ActionForm";
import { currentStaff } from "@/lib/auth/current";
import { can } from "@/lib/auth/permissions";
import { emailEnabled } from "@/lib/email";
import { addClient, makeClientLink, updateClient } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const staff = await currentStaff();
  // Before accounts are on, everyone manages every client.
  const manage = !staff || can(staff.access, "clients.manage");
  const own = staff?.access.scope === "own";
  const db = await getDb();
  const [all, links, people] = await Promise.all([
    db.select().from(clients).orderBy(asc(clients.name)),
    db.select().from(clientJobs).orderBy(asc(clientJobs.jobNumber)),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)).orderBy(asc(users.name)),
  ]);
  const list = own ? all.filter((c) => c.assignedUserId === staff!.user.id) : all;
  const jobsOf = new Map<number, string[]>();
  for (const l of links) jobsOf.set(l.clientId, [...(jobsOf.get(l.clientId) ?? []), l.jobNumber]);
  const personName = new Map(people.map((p) => [p.id, p.name]));
  const canEmail = emailEnabled();

  const DesignerPick = ({ value }: { value?: number | null }) =>
    own ? null : (
      <label>
        <span className="label">Designer</span>
        <select name="assignedUserId" defaultValue={value ?? ""}>
          <option value="">Nobody yet</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    );

  return (
    <>
      <header className="top">
        <div>
          <div className="label">Client portal</div>
          <h1>{own ? "My clients" : "Clients"}</h1>
          <p>Clients never get a password. Make a one-time sign-in link and text it, email it, or open it on their phone during the appointment. They only see the jobs linked here.</p>
        </div>
      </header>

      {manage && (
        <section>
          <h2>Add a client</h2>
          <ActionForm action={addClient} submit="Add client">
            <div className="formgrid">
              <label>
                <span className="label">Name</span>
                <input type="text" name="name" required />
              </label>
              <label>
                <span className="label">Email (optional)</span>
                <input type="email" name="email" />
              </label>
              <label>
                <span className="label">Phone (optional)</span>
                <input type="tel" name="phone" />
              </label>
              <label>
                <span className="label">Job numbers</span>
                <input type="text" name="jobs" placeholder="e.g. 51234, 51240" />
              </label>
              <DesignerPick />
            </div>
          </ActionForm>
        </section>
      )}

      <section>
        <h2>
          {own ? "Yours" : "All clients"} ({list.length})
        </h2>
        {list.length === 0 ? (
          <div className="empty">No clients yet.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Jobs</th>
                  {!own && <th>Designer</th>}
                  <th>Last sign-in</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="cust">{c.name}</div>
                      <div className="small">{[c.email, c.phone].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="mono">{(jobsOf.get(c.id) ?? []).join(", ") || "—"}</td>
                    {!own && <td>{c.assignedUserId ? personName.get(c.assignedUserId) : "—"}</td>}
                    <td className="small">{c.lastSignInAt ? c.lastSignInAt.toLocaleDateString("en-US") : "Never"}</td>
                    <td>
                      {manage && (
                        <details className="edit">
                          <summary>Sign-in link</summary>
                          <ActionForm action={makeClientLink} submit={canEmail && c.email ? "Email them a link" : "Make a link"}>
                            <input type="hidden" name="id" value={c.id} />
                            {canEmail && c.email && <input type="hidden" name="send" value="email" />}
                          </ActionForm>
                          <ActionForm action={updateClient} submit="Save">
                            <input type="hidden" name="id" value={c.id} />
                            <div className="formgrid">
                              <label>
                                <span className="label">Link more jobs</span>
                                <input type="text" name="jobs" placeholder="Job numbers" />
                              </label>
                              <DesignerPick value={c.assignedUserId} />
                            </div>
                          </ActionForm>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
