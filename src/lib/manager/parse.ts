// Parses the Special Orders table copied from the Closets by Design Manager screen.
// The copy arrives as tab-separated text, possibly with notes above the header row.

export type IsoDate = string; // YYYY-MM-DD

export interface StepRow {
  step: number;
  vendor: string;
  material: string;
  detail: string;
  ref: string; // initials of whoever completed the step
  eta: IsoDate | null;
  doneOn: IsoDate | null; // RCVD. DATE
}

export interface SpecialOrder {
  item: string;
  vendor: string;
  material: string;
  detail: string;
  ref: string;
  eta: IsoDate | null;
  receivedOn: IsoDate | null;
}

export interface ParsedFolder {
  index: number; // order within the job, starting at 0
  letter: string; // A, B, C... or "" when Manager does not say
  room: string;
  color: string;
  steps: Record<number, StepRow>;
}

export interface ParsedJob {
  jobNumber: string;
  customer: string;
  description: string;
  address: string;
  city: string;
  zip: string;
  designer: string;
  installer: string;
  contractOn: IsoDate | null;
  dueOn: IsoDate | null;
  installOn: IsoDate | null;
  amount: number | null;
  balance: number | null;
  folders: ParsedFolder[];
  specialOrders: SpecialOrder[];
}

export interface ParseResult {
  rowCount: number;
  jobs: ParsedJob[];
}

export class PasteError extends Error {}

const REQUIRED = ["CUST NAME", "JOB#", "SO ITEM", "RCVD. DATE", "INS. DATE"];

export function parseDate(value: string): IsoDate | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value.trim());
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

export function parseMoney(value: string): number | null {
  const n = Number.parseFloat(value.replace(/[$,\s]/g, ""));
  return Number.isNaN(n) ? null : n;
}

export function parseSpecialOrders(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const headerAt = lines.findIndex((l) => /CUST NAME/i.test(l) && /JOB#/i.test(l));
  if (headerAt < 0) {
    throw new PasteError("Could not find the header row. Copy the whole table, including the CUST NAME and JOB# headings.");
  }
  const header = lines[headerAt].split("\t").map((h) => h.trim().toUpperCase());
  const missing = REQUIRED.filter((h) => !header.includes(h));
  if (missing.length) {
    throw new PasteError(`Missing columns: ${missing.join(", ")}. Copy the table from the Special Orders tab.`);
  }
  const at = (cells: string[], name: string) => {
    const i = header.indexOf(name);
    return i < 0 ? "" : (cells[i] ?? "").trim();
  };

  const jobs = new Map<string, ParsedJob>();
  const current = new Map<string, ParsedFolder>();
  let rowCount = 0;

  for (const line of lines.slice(headerAt + 1)) {
    if (!line.trim()) continue;
    const cells = line.split("\t");
    const jobNumber = at(cells, "JOB#");
    if (cells.length < 5 || !jobNumber) continue;
    rowCount++;

    let job = jobs.get(jobNumber);
    if (!job) {
      job = {
        jobNumber,
        customer: at(cells, "CUST NAME"),
        description: at(cells, "JOB DESCRIPTION"),
        address: at(cells, "ADDRESS"),
        city: at(cells, "CITY"),
        zip: at(cells, "ZIP"),
        designer: at(cells, "DESIGNER"),
        installer: at(cells, "INSTALLER"),
        contractOn: parseDate(at(cells, "CONTRACT DATE")),
        dueOn: parseDate(at(cells, "DUE DATE")),
        installOn: parseDate(at(cells, "INS. DATE")),
        amount: parseMoney(at(cells, "JOB AMT.")),
        balance: parseMoney(at(cells, "JOB DUE")),
        folders: [],
        specialOrders: [],
      };
      jobs.set(jobNumber, job);
    }

    const item = at(cells, "SO ITEM");
    const fields = {
      vendor: at(cells, "VENDOR"),
      material: at(cells, "MATERIAL"),
      detail: at(cells, "SO ITEM DESCRIPTION").replace(/\s+/g, " "),
      ref: at(cells, "P.O. # / REF #").toUpperCase(),
      eta: parseDate(at(cells, "ETA")),
    };
    const numbered = /^(\d+)\s/.exec(item);
    if (!numbered) {
      job.specialOrders.push({ item, ...fields, receivedOn: parseDate(at(cells, "RCVD. DATE")) });
      continue;
    }

    // Manager lists each folder's steps in a block; a repeated step number starts the next folder.
    const step = Number(numbered[1]);
    let folder = current.get(jobNumber);
    if (!folder || folder.steps[step]) {
      folder = { index: job.folders.length, letter: "", room: "", color: "", steps: {} };
      job.folders.push(folder);
      current.set(jobNumber, folder);
    }
    folder.steps[step] = { step, ...fields, doneOn: parseDate(at(cells, "RCVD. DATE")) };

    const named = /Folder\s+([A-Z])\b\s*-?\s*(.*)$/i.exec(fields.material);
    if (named && !folder.letter) {
      folder.letter = named[1].toUpperCase();
      folder.room = named[2].trim();
    }
    if (step === 8) folder.color = fields.material.replace(/\s*-?\s*Folder.*$/i, "").trim();
  }

  return { rowCount, jobs: [...jobs.values()] };
}
