// Built-in sales forms. Each paper form is described here as sections of
// labelled fields, so the app draws it as a normal web form and saves every
// answer under a stable key. Nothing here holds prices: work sheet prices are
// loaded into the database by an admin (see prices.ts).

export type FieldType =
  | "text" // one line
  | "textarea" // several lines
  | "number" // a quantity or measurement
  | "date"
  | "check" // one tick box
  | "choice" // pick one of the options (tap again to clear)
  | "checks" // tick any of the options
  | "select"; // pick one from a long list

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  hint?: string;
  wide?: boolean; // takes a whole row
  // Header fields filled from the job when the sheet is added.
  prefill?: "customer" | "jobNumber" | "room" | "designer" | "date";
}

export interface FormSection {
  key: string;
  title: string;
  note?: string;
  fields: FormField[];
}

export interface DetailFormDef {
  key: string; // "closet-detail"
  kind: "detail";
  room: string;
  name: string;
  revision: string;
  position: number; // order in the packet: rooms in order, work sheet before detail sheet
  note?: string;
  sections: FormSection[];
}

export type Answer = string | number | boolean | string[];
export type Answers = Record<string, Answer>;

export function isBlank(v: Answer | undefined | null): boolean {
  if (v === undefined || v === null || v === false || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

// How an answer reads in the summary, the PDF and the answers table.
export function answerText(f: FormField, v: Answer | undefined): string {
  if (isBlank(v ?? null)) return "";
  if (f.type === "check") return "Yes";
  if (Array.isArray(v)) return v.join(", ");
  if (f.type === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-");
    return `${m}/${d}/${y}`;
  }
  return String(v);
}
