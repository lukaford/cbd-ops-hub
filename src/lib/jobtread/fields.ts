// JobTread custom fields the hub reads. Ids come from the Closets by Design
// organization (22PYUKGDseeA); the hub never writes to any of them.
export const FIELD = {
  status2: "22PcdJFdb77z", // "Status 2.0", set once a job is sold and scheduled for install
  installOn: "22PcdY7uBAwK", // "Confirmed Install Date"
  installConfirmed: "22Pd4VBvRxFA", // "Install Date Confirmed?"
  cncCutOn: "22PcdJFEBVwU",
  edgeBandingOn: "22PcdJFFKmSD",
  drawerAssemblyOn: "22PcdJFGaeuG",
  finalQaOn: "22PcdJFJ6Fdt",
  materialsOrdered: "22Pejy3rmHmG", // "All Materials Ordered"
  materials: "22PdgJjvKYuK", // "Material Type", one value per material on the job
  orderBy: "22PdgJrmCvAa", // "Lead Time Date (Order By)"
} as const;

export const FIELD_IDS = Object.values(FIELD);

export interface Stage {
  name: string;
  department: string;
  // Received by production or later: no longer at risk for the install.
  inProduction: boolean;
  hold?: boolean;
}

// Status 2.0 options in the order a job moves through them.
export const STAGES: Stage[] = [
  { name: "Sold", department: "Sales", inProduction: false },
  { name: "Sold, On Hold", department: "Sales", inProduction: false, hold: true },
  { name: "Engineering CAD", department: "Engineering", inProduction: false },
  { name: "Purchasing", department: "Purchasing", inProduction: false },
  { name: "Price Verification", department: "Price verification", inProduction: false },
  { name: "ENG QA", department: "Engineering QA", inProduction: false },
  { name: "Production", department: "Production", inProduction: true },
  { name: "Ready for Install", department: "Installation", inProduction: true },
  { name: "Ready for Install, Hold", department: "Installation", inProduction: true, hold: true },
];

// Status 2.0 values for jobs still heading to install.
export const ACTIVE_STAGES = STAGES.map((s) => s.name);
export const COMPLETE = "Complete";

// Material Type options, in JobTread's order. Tabs show the name without the lead time.
export const MATERIALS = [
  "Special Order Accessories",
  "Countertops - 4 weeks",
  "Deco (no glass) – 4 weeks",
  "Deco (glass, mesh, other) – 5 weeks",
  "Lighting – 4 weeks",
  "Glass shelves – 4 weeks",
  "Traxtile Garage Flooring – 3 weeks",
];

export function materialLabel(name: string): string {
  return name.replace(/\s+[-–]\s+\d+\s+weeks?$/, "");
}

export function stageInfo(name: string | null): Stage | null {
  if (name === COMPLETE) return { name: COMPLETE, department: "Installed", inProduction: true };
  return STAGES.find((s) => s.name === name) ?? null;
}
