import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, clients, users } from "@/db/schema";
import { requireStaff } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

const ACTIONS: Record<string, string> = {
  owner_created: "Created the admin account",
  sign_in: "Signed in",
  sign_in_failed: "Failed sign-in",
  user_invited: "Invited an employee",
  user_updated: "Changed an account",
  invite_accepted: "Accepted their invite",
  password_reset: "Set a new password",
  password_reset_created: "Made a password reset link",
  category_created: "Added a category",
  category_updated: "Changed a category",
  category_deleted: "Deleted a category",
  client_created: "Added a client",
  client_link_created: "Made a client sign-in link",
  client_sign_in: "Client signed in",
  client_updated: "Changed a client",
  designer_requested: "Asked the front office to name a designer",
  designer_assigned: "Assigned a designer to a job",
};

export default async function ActivityPage() {
  await requireStaff("audit.view");
  const db = await getDb();
  const [events, people, clientRows] = await Promise.all([
    db.select().from(auditEvents).orderBy(desc(auditEvents.at)).limit(300),
    db.select({ id: users.id, name: users.name }).from(users),
    db.select({ id: clients.id, name: clients.name }).from(clients),
  ]);
  const userName = new Map(people.map((u) => [u.id, u.name]));
  const clientName = new Map(clientRows.map((c) => [c.id, c.name]));
  const subject = (e: (typeof events)[number]) =>
    e.entity === "user" ? userName.get(Number(e.entityId)) : e.entity === "client" ? clientName.get(Number(e.entityId)) : e.entity === "email" || e.entity === "job" ? e.entityId : e.entity === "jobs" ? ((e.data as { jobs?: string[] }).jobs ?? []).join(", ") : "";

  return (
    <section>
      <h2>Latest activity</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>About</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="small">{e.at.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</td>
                <td>{e.actorUserId ? userName.get(e.actorUserId) : e.actorClientId ? `${clientName.get(e.actorClientId)} (client)` : "—"}</td>
                <td>{ACTIONS[e.action] ?? e.action}</td>
                <td className="small">{subject(e) ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
