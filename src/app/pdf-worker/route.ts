import { readFile } from "node:fs/promises";
import path from "node:path";

// pdf.js draws detail sheets in a background worker; serve its script from the installed package.
export async function GET() {
  const file = path.join(process.cwd(), "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
  return new Response(await readFile(file), { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
