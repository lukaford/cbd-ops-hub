import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { currentStaff } from "@/lib/auth/current";
import { markAllRead } from "./actions";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const me = await currentStaff();
  const list = me ? await (await getDb()).select().from(notifications).where(eq(notifications.userId, me.user.id)).orderBy(desc(notifications.createdAt)).limit(100) : [];
  const unread = list.filter((n) => !n.readAt).length;
  return (
    <>
      <header className="top">
        <div>
          <h1>Alerts</h1>
          <p>{unread ? `${unread} new` : "Nothing new."}</p>
        </div>
        {unread > 0 && (
          <form action={markAllRead}>
            <button className="btn" type="submit">
              Mark all read
            </button>
          </form>
        )}
      </header>
      {list.length === 0 ? (
        <div className="empty">No alerts yet.</div>
      ) : (
        <div className="tablewrap">
          <table>
            <tbody>
              {list.map((n) => (
                <tr key={n.id} style={n.readAt ? { opacity: 0.6 } : undefined}>
                  <td className="small">{n.createdAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td>
                    <div className="cust">{n.link ? <Link href={n.link}>{n.title}</Link> : n.title}</div>
                    {n.body && <div className="small">{n.body}</div>}
                  </td>
                  <td>{!n.readAt && <span className="pill crit">New</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
