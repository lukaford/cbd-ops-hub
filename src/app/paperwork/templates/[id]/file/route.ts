import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { formTemplates } from "@/db/schema";

export const dynamic = "force-dynamic";

// The blank form, for drawing the detail sheet behind its fields in the editor.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb();
  const [t] = await db.select({ file: formTemplates.file, fileName: formTemplates.fileName }).from(formTemplates).where(eq(formTemplates.id, Number((await params).id)));
  if (!t) return new Response("Not found", { status: 404 });
  const type = /\.pdf$/i.test(t.fileName) ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return new Response(Buffer.from(t.file), { headers: { "content-type": type, "cache-control": "private, max-age=3600" } });
}
