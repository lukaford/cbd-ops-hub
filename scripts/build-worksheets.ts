// Turns the company work sheets (.xlsx) into the built-in work sheet forms in
// src/lib/forms/native/worksheets/, with every price taken out. The prices go to
// a separate file that is loaded into the app's database (Paperwork > Prices) and
// is never committed: this repository is public.
//
//   npx vite-node --config vitest.config.ts scripts/build-worksheets.ts <prices-out.json> <room>=<file.xlsx> ...

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseWorkbook } from "@/lib/forms/sheetModel";
import { stripPrices, buildLayout } from "@/lib/forms/native/worksheetBuild";

const [pricesOut, ...pairs] = process.argv.slice(2);
if (!pricesOut || !pairs.length) throw new Error("usage: build-worksheets.ts <prices-out.json> <room>=<file.xlsx> ...");

const prices: Record<string, Record<string, number | string>> = {};
for (const pair of pairs) {
  const [room, file] = pair.split("=");
  const model = await parseWorkbook(new Uint8Array(readFileSync(file)));
  const { model: bare, prices: p } = stripPrices(model);
  const layout = buildLayout(bare, p);
  const key = `${room.toLowerCase().replace(/\s+/g, "")}-worksheet`;
  prices[key] = p;
  const out = path.join("src/lib/forms/native/worksheets", `${room.toLowerCase().replace(/\s+/g, "")}.json`);
  writeFileSync(out, JSON.stringify({ model: bare, layout }));
  const inputs = layout.sections.reduce((n, s) => n + s.rows.reduce((m, r) => m + r.cells.filter((c) => c.kind !== "out" && c.kind !== "price").length, 0), 0);
  console.log(`${room}: ${Object.keys(p).length} prices, ${layout.sections.length} sections, ${inputs} inputs -> ${out}`);
}
writeFileSync(pricesOut, JSON.stringify(prices, null, 1));
