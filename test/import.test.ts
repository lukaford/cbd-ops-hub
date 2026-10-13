import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "@/db";
import { isAtRisk, loadBoard } from "@/lib/board";
import { saveSnapshot } from "@/lib/import";
import { parseSpecialOrders } from "@/lib/manager/parse";

const fixture = readFileSync(path.join(__dirname, "fixtures", "special-orders.tsv"), "utf8");

describe("saveSnapshot", () => {
  it("stores a paste and builds the board from it", async () => {
    const db = await openDb("memory:");
    const summary = await saveSnapshot(db, parseSpecialOrders(fixture));
    expect(summary).toMatchObject({ rowCount: 31, jobCount: 2, folderCount: 3, droppedJobCount: 0 });

    const board = await loadBoard(db, "2026-10-12");
    expect(board.folders.map((f) => [f.jobNumber, f.letter, f.nextStep])).toEqual([
      ["50001", "A", null],
      ["50001", "B", 5],
      ["50002", "", 1],
    ]);
    expect(board.folders[1].steps).toHaveLength(10);
    expect(board.folders[1].specialOrders).toHaveLength(1);
    expect(board.folders.filter(isAtRisk).map((f) => f.jobNumber)).toEqual(["50001"]);
  });

  it("replaces a job on re-import and drops jobs no longer listed", async () => {
    const db = await openDb("memory:");
    await saveSnapshot(db, parseSpecialOrders(fixture));
    const onlyJobOne = fixture
      .split("\n")
      .filter((l) => !l.includes("\t50002\t"))
      .join("\n");
    const again = await saveSnapshot(db, parseSpecialOrders(onlyJobOne));
    expect(again.droppedJobCount).toBe(1);

    const board = await loadBoard(db, "2026-10-12");
    expect(board.folders.map((f) => f.jobNumber)).toEqual(["50001", "50001"]);
    expect(board.lastImport?.id).toBe(again.importId);
  });
});
