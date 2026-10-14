import { describe, expect, it } from "vitest";
import { openDb } from "@/db";
import { optionLists } from "@/db/schema";
import { cleanForm, currentDetailForms, loadLists, resolveForm, saveForm } from "@/lib/forms/native/editing";
import { DETAIL_SHEETS, allFields } from "@/lib/forms/native/detailSheets";
import { cleanDetailValues } from "@/lib/forms/native";
import { reviewPacket } from "@/lib/forms/review";
import type { DetailFormDef } from "@/lib/forms/native/types";

const closet = () => structuredClone(DETAIL_SHEETS.find((d) => d.key === "closet-detail")!);
const facts = { jobNumber: "1", customer: "Jane Smith", gridCount: 1, signatures: [] };

describe("form editor", () => {
  it("links built-in questions to the shared lists", () => {
    const color = allFields(closet()).find((f) => f.key === "color")!;
    expect(color.list).toBe("colors");
  });

  it("keeps only what a form may hold and explains what is wrong", () => {
    const base = DETAIL_SHEETS[0];
    const lists = new Set(["colors"]);
    const raw = closet() as unknown as Record<string, unknown>;
    const def = cleanForm({ ...raw, key: "other", room: "Garage", sections: [{ key: "a", title: "A", fields: [{ key: "x", label: "Finish", type: "select", options: ["Gloss", "gloss", " ", "Matte"], evil: 1 }] }] }, base, lists);
    expect(def.key).toBe(base.key);
    expect(def.room).toBe(base.room);
    expect(def.sections[0].fields[0]).toEqual({ key: "x", label: "Finish", type: "select", options: ["Gloss", "Matte"] });
    const bad = (fields: unknown[]) => () => cleanForm({ sections: [{ key: "a", title: "A", fields }] }, base, lists);
    expect(bad([{ key: "x", label: "Finish", type: "select", options: [] }])).toThrow(/needs at least one choice/);
    expect(bad([{ key: "x", label: "A", type: "text" }, { key: "x", label: "B", type: "text" }])).toThrow(/repeated/);
    expect(bad([{ key: "x", label: "A", type: "script" }])).toThrow(/unknown answer type/);
    // A list that doesn't exist falls back to the question's own choices.
    expect(cleanForm({ sections: [{ key: "a", title: "A", fields: [{ key: "x", label: "C", type: "select", list: "nope", options: ["One"] }] }] }, base, lists).sections[0].fields[0]).toEqual({ key: "x", label: "C", type: "select", options: ["One"] });
  });

  it("gives designers the manager's version with turned-off questions left out", async () => {
    const db = await openDb("memory:");
    const def = closet();
    const header = def.sections[0];
    header.fields.find((f) => f.key === "tear_out")!.hidden = true;
    header.fields.push({ key: "q_handles", label: "Handle finish", type: "select", list: "my_finishes" });
    await db.insert(optionLists).values([
      { key: "colors", name: "Colors", options: ["WHITE", "BLACK"] },
      { key: "my_finishes", name: "Finishes", options: ["Chrome", "Black"] },
    ]);
    const lists = await loadLists(db);
    expect(lists.find((l) => l.key === "colors")).toMatchObject({ builtin: true, changed: true });
    expect(lists.find((l) => l.key === "my_finishes")).toMatchObject({ builtin: false });
    await saveForm(db, cleanForm(def, DETAIL_SHEETS[0], new Set(lists.map((l) => l.key))), null);
    const now = (await currentDetailForms(db)).get("closet-detail")!;
    const fields = allFields(now);
    expect(fields.find((f) => f.key === "tear_out")).toBeUndefined();
    expect(fields.find((f) => f.key === "color")!.options).toEqual(["WHITE", "BLACK"]);
    expect(fields.find((f) => f.key === "q_handles")!.options).toEqual(["Chrome", "Black"]);
    // Other forms still use the built-in version, with the edited shared list.
    expect(allFields((await currentDetailForms(db)).get("pantry-detail")!).find((f) => f.key === "color")!.options).toEqual(["WHITE", "BLACK"]);
    // Designers can only save a choice the list offers.
    expect(cleanDetailValues(now, { color: "IVORY", q_handles: "Chrome", tear_out: "Major Tear Out" })).toEqual({ q_handles: "Chrome" });
  });

  it("flags required questions left blank", () => {
    const def: DetailFormDef = resolveForm(
      { ...closet(), sections: [{ key: "a", title: "A", fields: [{ key: "x", label: "Finish", type: "text", required: true }, { key: "y", label: "Off", type: "text", required: true, hidden: true }] }] },
      [],
    );
    const r = reviewPacket([{ id: 1, kind: "native", title: "Closet", room: "Closet", def, values: {} }], facts);
    const msgs = r.checks.map((c) => c.message);
    expect(msgs).toContain('"Finish" is not answered.');
    expect(msgs).not.toContain('"Off" is not answered.');
  });
});
