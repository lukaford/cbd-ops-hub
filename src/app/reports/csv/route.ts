import { freshBoard } from "@/lib/freshBoard";
import { parseJobQuery, queryJobs } from "@/lib/jobFilters";
import { pickColumns, toCsv } from "@/lib/reportColumns";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params: Record<string, string[]> = {};
  for (const [k, v] of url.searchParams) (params[k] ??= []).push(v);
  const { board, today } = await freshBoard();
  const jobs = queryJobs(board.jobs, parseJobQuery(params));
  const csv = toCsv(jobs, pickColumns(params.col ?? []));
  // The byte-order mark makes Excel read the file as UTF-8.
  return new Response("﻿" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="cbd-report-${today}.csv"`,
    },
  });
}
