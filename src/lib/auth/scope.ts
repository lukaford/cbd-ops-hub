import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { paperworkDocs, paperworkFiles, paperworkPackets } from "@/db/schema";

// The job a page belongs to, for pages about a single job (a packet, one of its
// sheets or files). Undefined for pages that aren't about one job.
export async function jobNumberForPath(db: Db, pathname: string): Promise<string | null | undefined> {
  let m = pathname.match(/^\/paperwork\/(\d+)(?:\/|$)/);
  if (m) return packetJob(db, Number(m[1]));
  m = pathname.match(/^\/paperwork\/doc\/(\d+)(?:\/|$)/);
  if (m) {
    const [doc] = await db.select({ packetId: paperworkDocs.packetId }).from(paperworkDocs).where(eq(paperworkDocs.id, Number(m[1])));
    return doc ? packetJob(db, doc.packetId) : null;
  }
  m = pathname.match(/^\/paperwork\/files\/(\d+)(?:\/|$)/);
  if (m) {
    const [file] = await db.select({ packetId: paperworkFiles.packetId }).from(paperworkFiles).where(eq(paperworkFiles.id, Number(m[1])));
    return file ? packetJob(db, file.packetId) : null;
  }
  return undefined;
}

async function packetJob(db: Db, id: number): Promise<string | null> {
  const [p] = await db.select({ jobNumber: paperworkPackets.jobNumber }).from(paperworkPackets).where(eq(paperworkPackets.id, id));
  return p?.jobNumber ?? null;
}
