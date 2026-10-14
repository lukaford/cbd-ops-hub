// Names and order for paperwork, so every packet reads the same way in JobTread:
// rooms in the order of their template numbers, each room's work sheet then its
// detail sheet, then notes, grids and the signature record.

const ROOMS = ["Closet", "Pantry", "Office", "Wall Bed", "Garage", "Laundry", "Entry", "Kitchen", "Media", "Craft"];

export interface TemplateInfo {
  name: string;
  room: string;
  position: number;
  kind: "detail" | "worksheet";
}

// "01a. Closet Detail Sheet.pdf" -> Closet Detail Sheet, room Closet, position 1.5
export function templateInfo(fileName: string): TemplateInfo {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  const m = /^(\d+)([a-z]?)[.\s_-]+(.*)$/i.exec(base);
  const name = (m ? m[3] : base).replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  const n = m ? Number(m[1]) : 99;
  const sub = m?.[2] ? (m[2].toLowerCase().charCodeAt(0) - 96) / 10 : 0;
  const room = ROOMS.find((r) => name.toLowerCase().includes(r.toLowerCase())) ?? name.replace(/\b(detail|work|sheet|worksheet|room)\b/gi, "").trim();
  const kind = /\.xlsx?$/i.test(fileName) ? "worksheet" : "detail";
  // "01." is the room's work sheet and "01a." its detail sheet, so work sheets come first.
  return { name, room, position: n + sub, kind };
}

export function lastName(customer: string): string {
  const c = customer.replace(/\s*&.*$/, "").trim();
  if (c.includes(",")) return c.split(",")[0].trim();
  const parts = c.split(/\s+/);
  return parts[parts.length - 1] || c;
}

export function packetTitle(p: { label: string; version: number }): string {
  return `${p.label} v${p.version}`;
}

const unsafe = /[\\/:*?"<>|]+/g;

// "63931 Smith - Sale Paperwork v1.pdf"
export function packetFileName(p: { jobNumber: string; customer: string; label: string; version: number }, ext = "pdf"): string {
  const who = lastName(p.customer);
  return `${p.jobNumber}${who ? " " + who : ""} - ${packetTitle(p)}.${ext}`.replace(unsafe, "-");
}

export const PACKET_LABELS = ["Sale Paperwork", "Final Measurements", "Revision", "Change Order"];

export const SIGN_CONSENT =
  "I agree to sign this paperwork electronically. My electronic signature has the same effect as my handwritten signature, and I can ask for a paper copy.";
