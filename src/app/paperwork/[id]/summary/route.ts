import { getDb } from "@/db";
import { loadPacket, reviewLoaded } from "@/lib/paperwork";
import { summaryWorkbook } from "@/lib/forms/summarySheet";
import { inScope, visibleJobs } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lp = await loadPacket(await getDb(), Number((await params).id));
  if (!lp || !inScope(await visibleJobs(), lp.packet.jobNumber)) return new Response("Not found", { status: 404 });
  const bytes = await summaryWorkbook(lp, reviewLoaded(lp));
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${lp.fileName.replace(/\.pdf$/, " - Summary.xlsx").replace(/"/g, "")}"`,
    },
  });
}
