// The numbered SO ITEM rows Manager keeps for every production folder.
// Step 10 is numbered last but is normally recorded first.
export const STEPS: Record<number, { name: string; department: string }> = {
  1: { name: "Folder created", department: "Front office" },
  2: { name: "CAD drawings", department: "Engineering CAD" },
  3: { name: "Purchasing approval", department: "Purchasing" },
  4: { name: "Price check", department: "Price verification" },
  5: { name: "Folder QA", department: "Engineering" },
  6: { name: "Folder nested", department: "Engineering" },
  7: { name: "Folder scanned", department: "Front office" },
  8: { name: "Job color", department: "Front office" },
  9: { name: "Received by production", department: "Production" },
  10: { name: "Final measurements", department: "Front office" },
};

export const PRODUCTION_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const FINAL_STEP = 9;
