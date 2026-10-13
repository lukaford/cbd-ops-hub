import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSpecialOrders, PasteError } from "@/lib/manager/parse";
import { folderProgress, installRisk } from "@/lib/manager/progress";

const fixture = readFileSync(path.join(__dirname, "fixtures", "special-orders.tsv"), "utf8");

describe("parseSpecialOrders", () => {
  const parsed = parseSpecialOrders(fixture);

  it("skips notes above the header and reads every row", () => {
    expect(parsed.rowCount).toBe(31);
    expect(parsed.jobs.map((j) => j.jobNumber)).toEqual(["50001", "50002"]);
  });

  it("splits a job into folders when step numbers repeat", () => {
    const [one] = parsed.jobs;
    expect(one.folders.map((f) => [f.letter, f.room, f.color])).toEqual([
      ["A", "Closets", "White"],
      ["B", "Pantry", "White"],
    ]);
    expect(Object.keys(one.folders[1].steps)).toHaveLength(10);
  });

  it("reads job fields, dates and money", () => {
    const [one] = parsed.jobs;
    expect(one.installOn).toBe("2026-10-23");
    expect(one.dueOn).toBe("2026-10-20");
    expect(one.amount).toBe(12500);
    expect(one.balance).toBe(6250);
  });

  it("keeps non-numbered items as special orders", () => {
    const [one] = parsed.jobs;
    expect(one.specialOrders).toEqual([
      expect.objectContaining({ item: "Countertop - HPL (Wilsonart or Match)", vendor: "KCC", eta: "2026-10-15", receivedOn: null }),
    ]);
  });

  it("tidies spacing and initials", () => {
    const b = parsed.jobs[0].folders[1];
    expect(b.steps[9].detail).toBe("Drawers NO");
    expect(b.steps[2].ref).toBe("CB");
  });

  it("explains a paste without the header row", () => {
    expect(() => parseSpecialOrders("just some text")).toThrow(PasteError);
  });
});

describe("folderProgress", () => {
  const [one, two] = parseSpecialOrders(fixture).jobs;

  it("treats a folder with step 9 dated as received by production", () => {
    expect(folderProgress(one.folders[0])).toMatchObject({ furthest: 9, next: null, last: { step: 9, ref: "FBS" } });
  });

  it("uses the furthest dated step even when earlier steps are undated", () => {
    expect(folderProgress(one.folders[1])).toMatchObject({ furthest: 4, next: 5 });
  });

  it("waits on step 1 when only final measurements are in", () => {
    expect(folderProgress(two.folders[0])).toMatchObject({ furthest: 0, next: 1, last: { step: 10 } });
  });

  it("counts job color as done once a color is entered", () => {
    const folder = { color: "White", steps: { 7: { doneOn: "2026-09-01", ref: "NH" } } };
    expect(folderProgress(folder).next).toBe(9);
    expect(folderProgress({ ...folder, color: "" }).next).toBe(8);
  });
});

describe("installRisk", () => {
  it("grades by days to the firm install date", () => {
    expect(installRisk(null, "2026-10-13", "2026-10-12")).toBe("in-production");
    expect(installRisk(3, "2026-10-10", "2026-10-12")).toBe("past-install");
    expect(installRisk(3, "2026-10-19", "2026-10-12")).toBe("critical");
    expect(installRisk(3, "2026-10-26", "2026-10-12")).toBe("warning");
    expect(installRisk(3, "2026-10-27", "2026-10-12")).toBe("ok");
    expect(installRisk(3, null, "2026-10-12")).toBe("no-date");
  });
});
