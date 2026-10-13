import type { Lead } from "./jobBoard";

export const LEAD_VIEWS = [
  { key: "upcoming", label: "Upcoming appointments", note: "Appt Set, appointment today or later" },
  { key: "result", label: "Needs a result", note: "Appt Set, but the appointment date has passed. Mark these Sold or Unsold in JobTread." },
  { key: "unsold", label: "Unsold", note: "Seen but not sold yet: follow up" },
] as const;
export type LeadView = (typeof LEAD_VIEWS)[number]["key"];

export function viewOf(l: Lead, today: string): LeadView | null {
  if (l.stage === "Unsold") return "unsold";
  if (l.stage === "Appt Set" || l.stage === "New Lead") return l.apptOn && l.apptOn >= today ? "upcoming" : "result";
  return null;
}
