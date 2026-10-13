import { describe, expect, it } from "vitest";
import { bookInfo, groupLines, pageItems, searchCatalog } from "@/lib/catalog/priceBook";

const run = (str: string, x: number, y: number, size = 10) => ({ str, x, y, w: str.length * size * 0.5, size });

describe("price book", () => {
  it("names books from their file names", () => {
    expect(bookInfo("01 Main Components Rev8 05-01-25.pdf")).toEqual({ name: "Main Components", revision: "Rev8 05-01-25", position: 1 });
    expect(bookInfo("Handles.pdf")).toEqual({ name: "Handles", revision: "", position: 99 });
  });

  it("reads priced lines with their section and column headings", () => {
    const lines = groupLines([
      run("PANELS", 20, 700, 14),
      run("12\" Deep", 300, 680),
      run("16\" Deep", 360, 680),
      run("Wall Panel (48 1/8\" to 96\" tall)", 20, 660),
      run("\"WP\"", 200, 660),
      run("$100", 300, 660),
      run("$120", 360, 661),
      run("Some note without a price", 20, 640),
      run("Page 2", 500, 20),
    ]);
    const { items, headings } = pageItems(lines, 2);
    expect(headings).toEqual(["PANELS"]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ page: 2, section: "PANELS", label: 'Wall Panel (48 1/8" to 96" tall)  "WP"', prices: ["$100", "$120"] });
    expect(items[0].columns).toContain('12" Deep');
  });

  it("searches across books, best matches first", () => {
    const item = (label: string, section: string) => ({ page: 1, section, columns: "", label, prices: ["$1"], text: `${label} $1` });
    const books = [{ id: 1, name: "Closets", model: { pages: [], items: [item("Valet rod", "RODS"), item("Tie rack", "VALET")] } }];
    const hits = searchCatalog(books, "valet");
    expect(hits.map((h) => h.item.label)).toEqual(["Valet rod", "Tie rack"]);
    expect(searchCatalog(books, "")).toEqual([]);
  });
});
