import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { activeTemplates, loadPacket, reviewLoaded } from "@/lib/paperwork";
import { PACKET_LABELS, packetTitle } from "@/lib/forms/naming";
import { addIssue, addSheet, deleteDraft, deleteFile, removeDoc, resolveIssue, saveNotes, startPacket, submitPacket, uploadFiles } from "../actions";

export const dynamic = "force-dynamic";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function PacketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const db = await getDb();
  const lp = await loadPacket(db, Number((await params).id));
  if (!lp) notFound();
  const sp = await searchParams;
  const { packet: p } = lp;
  const draft = p.status === "draft";
  const templates = draft ? await activeTemplates(db) : [];
  const review = reviewLoaded(lp);
  const total = review.rooms.reduce((s, r) => s + (r.salePrice ?? 0), 0);
  const openIssues = lp.issues.filter((i) => !i.resolvedAt);
  const rooms = new Map<string, typeof review.rooms>();
  for (const r of review.rooms) (rooms.get(r.title) ?? rooms.set(r.title, []).get(r.title)!).push(r);

  return (
    <>
      <header className="top">
        <div>
          <div className="label">
            <Link href="/paperwork">Paperwork</Link> · Job {p.jobNumber}
          </div>
          <h1>
            {p.customer}: {packetTitle(p)}
          </h1>
          <p>
            <span className={`pill ${draft ? "warn" : lp.newer ? "" : "ok"}`}>{lp.newer ? `Superseded by v${lp.newer.version}` : draft ? "Draft" : `Submitted ${p.submittedAt?.toLocaleDateString("en-US")}`}</span>{" "}
            File name: <span className="mono">{lp.fileName}</span>
          </p>
        </div>
        <div className="actions">
          <a className="btn" href={`/paperwork/${p.id}/pdf?view`} target="_blank" rel="noreferrer">
            View PDF
          </a>
          <a className="btn primary" href={`/paperwork/${p.id}/pdf`}>
            Download PDF
          </a>
          <a className="btn" href={`/paperwork/${p.id}/summary`}>
            Summary (Excel)
          </a>
        </div>
      </header>

      {sp.submitted && (
        <div className="banner">
          <p>Submitted. Download the PDF and upload it to the job&apos;s Designer Paperwork folder in JobTread.</p>
        </div>
      )}
      {lp.newer && (
        <div className="alert">
          <span className="big">!</span>
          <div>
            <div className="what">This version was replaced.</div>
            <div className="sub">
              Use <Link href={`/paperwork/${lp.newer.id}`}>v{lp.newer.version} {lp.newer.label}</Link>. This PDF is stamped &quot;Superseded&quot;.
            </div>
          </div>
        </div>
      )}

      {lp.versions.length > 1 && (
        <nav className="tabs" aria-label="Versions">
          {lp.versions.map((v) => (
            <Link key={v.id} className={`tab${v.id === p.id ? " on" : ""}`} href={`/paperwork/${v.id}`}>
              v{v.version} {v.label} <span className="n">{v.status === "submitted" ? "submitted" : "draft"}</span>
            </Link>
          ))}
        </nav>
      )}

      <section className="panel" id="sheets">
        <h2>Sheets</h2>
        {lp.docs.length === 0 && <p className="muted">Add a work sheet and a detail sheet for each room.</p>}
        <table className="list">
          <tbody>
            {lp.docs.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link href={`/paperwork/doc/${d.id}`}>{d.title}</Link>
                </td>
                <td>{d.template.name}</td>
                <td className="muted">{d.template.revision}</td>
                <td className="muted">Saved {d.updatedAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</td>
                <td>
                  {draft && (
                    <form action={removeDoc}>
                      <input type="hidden" name="id" value={d.id} />
                      <button className="link" type="submit">
                        Remove
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {draft && templates.length > 0 && (
          <form action={addSheet} className="controls">
            <input type="hidden" name="packetId" value={p.id} />
            <select name="templateId" aria-label="Form" required>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input name="title" placeholder="Room name, e.g. Master Closet" aria-label="Room name" />
            <button className="btn primary" type="submit">
              Add sheet
            </button>
          </form>
        )}
        {draft && templates.length === 0 && (
          <p className="muted">
            No templates yet. <Link href="/paperwork/templates">Upload them</Link>.
          </p>
        )}
      </section>

      <section className="panel" id="summary">
        <h2>Summary</h2>
        <table className="list">
          <thead>
            <tr>
              <th>Room</th>
              <th>Color</th>
              <th>Collection</th>
              <th>Special orders</th>
              <th className="r">Sale price</th>
            </tr>
          </thead>
          <tbody>
            {[...rooms].map(([title, rs]) => {
              const detail = rs.find((r) => r.kind === "detail");
              const work = rs.find((r) => r.kind === "worksheet");
              const types = [...new Set(review.specials.filter((s) => s.room === title).map((s) => s.type))];
              return (
                <tr key={title}>
                  <td>{title}</td>
                  <td>{detail?.header.color || "—"}</td>
                  <td>{detail?.header.collection || work?.purchased.find((x) => /^(everyday|classic|brio)/i.test(x.item))?.item || "—"}</td>
                  <td>{types.join(", ") || "—"}</td>
                  <td className="r num">{work?.salePrice !== undefined ? money(work.salePrice) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Total</td>
              <td className="r num">{money(total)}</td>
            </tr>
          </tfoot>
        </table>
        {review.specials.length > 0 && (
          <details>
            <summary>Special-order items found ({review.specials.length})</summary>
            <ul>
              {review.specials.map((s, i) => (
                <li key={i}>
                  {s.room}: <strong>{s.type}</strong>: {s.item}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="panel" id="checks">
        <h2>
          Checks and open items <span className="muted">({review.checks.length + openIssues.length})</span>
        </h2>
        {review.checks.length + lp.issues.length === 0 && <p className="msg">Nothing missing.</p>}
        <ul className="checks">
          {review.checks.map((c, i) => (
            <li key={i} className={c.level}>
              <span className={`pill ${c.level === "missing" ? "crit" : "warn"}`}>{c.level === "missing" ? "Missing" : "Check"}</span>
              {c.room && <strong>{c.room}: </strong>}
              {c.docId ? <Link href={`/paperwork/doc/${c.docId}`}>{c.message}</Link> : c.message}
            </li>
          ))}
          {lp.issues.map((i) => (
            <li key={`i${i.id}`} className={i.resolvedAt ? "done" : ""}>
              <form action={resolveIssue} className="inline">
                <input type="hidden" name="id" value={i.id} />
                <button className="link" type="submit" aria-label={i.resolvedAt ? "Reopen" : "Mark resolved"}>
                  {i.resolvedAt ? "☑" : "☐"}
                </button>
              </form>
              <span className="pill">Open item</span> {i.text} {i.createdBy && <span className="muted">({i.createdBy})</span>}
            </li>
          ))}
        </ul>
        <form action={addIssue} className="controls">
          <input type="hidden" name="packetId" value={p.id} />
          <input name="text" placeholder="Flag something: missing info, a possible error, an outstanding item" aria-label="New open item" required />
          <input name="createdBy" placeholder="Your initials" aria-label="Your initials" size={8} />
          <button className="btn" type="submit">
            Add
          </button>
        </form>
      </section>

      <section className="panel" id="notes">
        <h2>Notes</h2>
        {draft ? (
          <form action={saveNotes} className="stack">
            <input type="hidden" name="packetId" value={p.id} />
            <label>
              Designer <input name="designer" defaultValue={p.designer} />
            </label>
            <textarea name="notes" defaultValue={p.notes} rows={6} placeholder="Anything the office, engineering or the installers should know." />
            <button className="btn" type="submit">
              Save notes
            </button>
          </form>
        ) : (
          <p className="pre">{p.notes || "No notes."}</p>
        )}
      </section>

      <section className="panel" id="files">
        <h2>Grids and attachments</h2>
        {sp.rejected && <p className="msg err">Not added (only photos, PNG, JPG or PDF up to 8 MB): {sp.rejected}</p>}
        <div className="files">
          {lp.files.map((f) => (
            <figure key={f.id}>
              <a href={`/paperwork/files/${f.id}`} target="_blank" rel="noreferrer">
                {f.contentType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/paperwork/files/${f.id}`} alt={f.name} />
                ) : (
                  <span className="pdf">PDF</span>
                )}
              </a>
              <figcaption>
                {f.kind === "grid" ? "Grid" : "Other"}: {f.name}
                {draft && (
                  <form action={deleteFile} className="inline">
                    <input type="hidden" name="id" value={f.id} />
                    <button className="link" type="submit">
                      Remove
                    </button>
                  </form>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
        {draft && (
          <form action={uploadFiles} className="controls">
            <input type="hidden" name="packetId" value={p.id} />
            <select name="kind" aria-label="What is it">
              <option value="grid">Grid</option>
              <option value="other">Other attachment</option>
            </select>
            <input type="file" name="files" multiple accept="image/*,application/pdf" capture="environment" required aria-label="Photos or PDFs" />
            <button className="btn" type="submit">
              Add
            </button>
          </form>
        )}
      </section>

      <section className="panel" id="signatures">
        <h2>Signatures</h2>
        <ul className="checks">
          {lp.signatures.map((s) => (
            <li key={s.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="sig" src={s.image} alt={`Signature of ${s.signerName}`} />
              <strong>{s.role === "customer" ? "Customer" : "Designer"}:</strong> {s.signerName}, {s.signedAt.toLocaleString("en-US")}
              {!s.current && <span className="pill warn">Paperwork changed after signing</span>}
            </li>
          ))}
        </ul>
        {draft && (
          <div className="actions">
            <Link className="btn primary" href={`/paperwork/${p.id}/sign?role=customer`}>
              Customer signs
            </Link>
            <Link className="btn" href={`/paperwork/${p.id}/sign?role=designer`}>
              Designer signs
            </Link>
          </div>
        )}
      </section>

      <section className="panel">
        {draft ? (
          <div className="actions">
            <form action={submitPacket}>
              <input type="hidden" name="packetId" value={p.id} />
              <button className="btn primary" type="submit">
                Submit paperwork{review.checks.length ? ` (${review.checks.length} checks open)` : ""}
              </button>
            </form>
            <form action={deleteDraft}>
              <input type="hidden" name="packetId" value={p.id} />
              <button className="link" type="submit">
                Delete this draft
              </button>
            </form>
          </div>
        ) : (
          <form action={startPacket} className="controls">
            <input type="hidden" name="jobtreadId" value={p.jobtreadId ?? ""} />
            <input type="hidden" name="jobNumber" value={p.jobNumber} />
            <input type="hidden" name="customer" value={p.customer} />
            <input type="hidden" name="copyFrom" value={p.id} />
            <span>Need to change something, or final measurements came in?</span>
            <select name="label" aria-label="New version type" defaultValue="Final Measurements">
              {PACKET_LABELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
            <button className="btn primary" type="submit">
              Start v{Math.max(...lp.versions.map((v) => v.version)) + 1}
            </button>
          </form>
        )}
      </section>
    </>
  );
}
