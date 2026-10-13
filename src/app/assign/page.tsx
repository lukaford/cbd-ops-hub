import { getDb } from "@/db";
import { requireStaff } from "@/lib/auth/current";
import { designerAccounts, jobsNeedingDesigner } from "@/lib/designers";
import { assignJob } from "./actions";

export const dynamic = "force-dynamic";

export default async function AssignPage() {
  await requireStaff("jobs.assign");
  const db = await getDb();
  const [jobs, designers] = await Promise.all([jobsNeedingDesigner(db), designerAccounts(db)]);
  const byName = new Map(designers.flatMap((d) => [d.name, ...d.jobNames].map((n) => [n.trim().toLowerCase(), d.id] as const)));

  return (
    <>
      <header className="top">
        <div>
          <div className="label">Front office</div>
          <h1>Jobs needing a designer</h1>
          <p>
            Open jobs with no designer: none in the Manager paste, and no designer took their photos in JobTread or has them assigned. Until one is picked, no designer sees the
            job. The front office manager gets an alert when a new one shows up.
          </p>
        </div>
      </header>
      {designers.length === 0 && (
        <div className="banner">
          <p>No designer accounts yet. Add designers on the Admin page (in a category that sees only their own work) to assign jobs to them.</p>
        </div>
      )}
      {jobs.length === 0 ? (
        <div className="empty">Every open job has a designer.</div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Customer</th>
                <th>Stage</th>
                <th>Photos by</th>
                <th>Designer</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const guess = j.photographers.map((p) => byName.get(p.trim().toLowerCase())).find(Boolean);
                return (
                  <tr key={j.jobNumber} id={`job-${j.jobNumber}`}>
                    <td className="jobno">{j.jobNumber}</td>
                    <td>
                      <div className="cust">{j.customer || "—"}</div>
                      <div className="small">{j.name}</div>
                    </td>
                    <td>{j.stage ?? "Manager only"}</td>
                    <td className="small">{j.photographers.join(", ") || "No photos yet"}</td>
                    <td>
                      <form action={assignJob} className="controls">
                        <input type="hidden" name="jobNumber" value={j.jobNumber} />
                        <select name="designerId" defaultValue={guess ?? ""} required aria-label={`Designer for job ${j.jobNumber}`}>
                          <option value="" disabled>
                            Pick a designer
                          </option>
                          {designers.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                        <button className="btn primary" type="submit">
                          Assign
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
