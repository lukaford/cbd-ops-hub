import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, clients, staffCategories, userCategories, users } from "@/db/schema";
import { requireStaff } from "@/lib/auth/current";
import { emailEnabled } from "@/lib/email";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  await requireStaff("users.manage");
  const db = await getDb();
  const [people, cats, clientCount, recent] = await Promise.all([
    db.select().from(users),
    db
      .select({ id: staffCategories.id, name: staffCategories.name, jobScope: staffCategories.jobScope, members: count(userCategories.userId) })
      .from(staffCategories)
      .leftJoin(userCategories, eq(userCategories.categoryId, staffCategories.id))
      .groupBy(staffCategories.id)
      .orderBy(staffCategories.position),
    db.select({ n: count() }).from(clients),
    db.select({ n: count() }).from(auditEvents).where(eq(auditEvents.action, "sign_in_failed")),
  ]);
  const active = people.filter((u) => u.active);
  const pending = active.filter((u) => !u.passwordHash);
  const admins = active.filter((u) => u.role === "admin");

  return (
    <>
      <div className="queues">
        <Link className="queue" href="/admin/users">
          <span className="n">{active.length}</span>
          <span className="s">Active accounts</span>
          <span className="d">{admins.length} admin{admins.length === 1 ? "" : "s"}</span>
        </Link>
        <Link className="queue" href="/admin/users?category=pending">
          <span className="n">{pending.length}</span>
          <span className="s">Invites not accepted</span>
          <span className="d">Make a new link if theirs expired</span>
        </Link>
        <Link className="queue" href="/admin/categories">
          <span className="n">{cats.length}</span>
          <span className="s">Categories</span>
          <span className="d">What each group can do</span>
        </Link>
        <Link className="queue" href="/clients">
          <span className="n">{clientCount[0].n}</span>
          <span className="s">Clients</span>
          <span className="d">With portal sign-in</span>
        </Link>
        <Link className="queue" href="/admin/activity">
          <span className="n">{recent[0].n}</span>
          <span className="s">Failed sign-ins</span>
          <span className="d">All time</span>
        </Link>
      </div>

      <section>
        <h2>People by category</h2>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Sees</th>
                <th className="num">People</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/admin/users?category=${c.id}`}>{c.name}</Link>
                  </td>
                  <td>{c.jobScope === "own" ? "Only their own work" : "Every job"}</td>
                  <td className="num">{c.members}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {!emailEnabled() && (
        <p className="small">Email isn&apos;t set up, so invites and client links are copied and sent by hand. Add RESEND_API_KEY and EMAIL_FROM to send them automatically.</p>
      )}
    </>
  );
}
