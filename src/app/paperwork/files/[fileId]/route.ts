import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { paperworkFiles } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const db = await getDb();
  const [f] = await db.select().from(paperworkFiles).where(eq(paperworkFiles.id, Number((await params).fileId)));
  if (!f) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(f.data), {
    headers: { "content-type": f.contentType, "content-disposition": `inline; filename="${encodeURIComponent(f.name)}"`, "cache-control": "private, max-age=3600" },
  });
}
