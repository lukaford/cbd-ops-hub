import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { clientJobs, clients } from "@/db/schema";
import { ActionForm } from "@/components/ActionForm";
import { requireStaff } from "@/lib/auth/current";
import { emailEnabled } from "@/lib/email";
import { addClient, addJobs, makeClientLink } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  await requireStaff("clients.manage");
  const db = await getDb();
  const [list, links] = await Promise.all([db.select().from(clients).orderBy(asc(clients.name)), db.select().from(clientJobs).orderBy(asc(clientJobs.jobNumber))]);
  const jobsOf = new Map<number, string[]>();
  for (const l of links) jobsOf.set(l.clientId, [...(jobsOf.get(l.clientId) ?? []), l.jobNumber]);
  const canEmail = emailEnabled();

  return (
    <>
      <header className="top">
        <div>
          <div className="label">Client portal</div>
          <h1>Clients</h1>
          <p>Clients never get a password. Make a one-time sign-in link and text it, email it, or open it on their phone during the appointment. They only see the jobs linked here.</p>
        </div>
      </header>

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
          </div>
        </ActionForm>
      </section>

      <section>
        <h2>All clients ({list.length})</h2>
        {list.length === 0 ? (
          <div className="empty">No clients yet.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Jobs</th>
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
                    <td className="small">{c.lastSignInAt ? c.lastSignInAt.toLocaleDateString("en-US") : "Never"}</td>
                    <td>
                      <details className="edit">
                        <summary>Sign-in link</summary>
                        <ActionForm action={makeClientLink} submit={canEmail && c.email ? "Email them a link" : "Make a link"}>
                          <input type="hidden" name="id" value={c.id} />
                          {canEmail && c.email && <input type="hidden" name="send" value="email" />}
                        </ActionForm>
                        <ActionForm action={addJobs} submit="Link jobs">
                          <input type="hidden" name="id" value={c.id} />
                          <input type="text" name="jobs" placeholder="More job numbers" required />
                        </ActionForm>
                      </details>
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
