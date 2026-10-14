import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { priceBookChunks, priceBooks } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const db = await getDb();
  const id = Number((await params).bookId);
  const [b] = await db.select({ fileName: priceBooks.fileName, size: priceBooks.size }).from(priceBooks).where(eq(priceBooks.id, id));
  if (!b) return new Response("Not found", { status: 404 });
  const ids = await db.select({ id: priceBookChunks.id }).from(priceBookChunks).where(eq(priceBookChunks.bookId, id)).orderBy(asc(priceBookChunks.seq));
  // Stream the pieces one at a time so a large book never sits in one database value.
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const c of ids) {
        const [row] = await db.select({ data: priceBookChunks.data }).from(priceBookChunks).where(eq(priceBookChunks.id, c.id));
        controller.enqueue(row.data);
      }
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(b.size),
      "content-disposition": `inline; filename="${b.fileName.replace(/"/g, "")}"`,
      "cache-control": "private, max-age=86400",
    },
  });
}
