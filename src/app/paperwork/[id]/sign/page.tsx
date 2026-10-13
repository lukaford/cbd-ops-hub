import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { loadPacket, reviewLoaded } from "@/lib/paperwork";
import { SIGN_CONSENT, packetTitle } from "@/lib/forms/naming";
import SignaturePad from "./SignaturePad";

export const dynamic = "force-dynamic";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function SignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const lp = await loadPacket(await getDb(), Number((await params).id));
  if (!lp) notFound();
  const role = (await searchParams).role === "designer" ? "designer" : "customer";
  const { packet: p } = lp;
  const review = reviewLoaded(lp);
  const rooms = review.rooms.filter((r) => r.kind === "worksheet");

  return (
    <>
      <header className="top">
        <div>
          <div className="label">
            <Link href={`/paperwork/${p.id}`}>Back to the paperwork</Link>
          </div>
          <h1>{role === "customer" ? "Customer signature" : "Designer signature"}</h1>
          <p>
            {p.customer}, job {p.jobNumber}: {packetTitle(p)}
          </p>
        </div>
      </header>
      {p.status !== "draft" ? (
        <p className="msg err">This paperwork was already submitted.</p>
      ) : (
        <>
          <section className="panel">
            <h2>What you are signing</h2>
            <table className="list">
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.docId}>
                    <td>{r.title}</td>
                    <td className="r num">{r.salePrice !== undefined ? money(r.salePrice) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="r num">{money(rooms.reduce((s, r) => s + (r.salePrice ?? 0), 0))}</td>
                </tr>
              </tfoot>
            </table>
            <p>
              <a href={`/paperwork/${p.id}/pdf?view`} target="_blank" rel="noreferrer">
                Read the full paperwork (PDF)
              </a>
              , {lp.docs.length} sheets{lp.files.length ? ` and ${lp.files.length} attachments` : ""}.
            </p>
          </section>
          <SignaturePad packetId={p.id} role={role} hash={lp.contentHash} consent={SIGN_CONSENT} defaultName={role === "customer" ? p.customer : p.designer} />
        </>
      )}
    </>
  );
}
