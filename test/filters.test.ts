import { describe, expect, it } from "vitest";
import type { BoardJob } from "@/lib/jobBoard";
import { parseJobQuery, queryJobs } from "@/lib/jobFilters";
import { installDateFromName } from "@/lib/jobtread/titleDate";
import { pickColumns, toCsv } from "@/lib/reportColumns";

describe("install date from the job name", () => {
  it("reads the formats in use", () => {
    expect(installDateFromName("63931 Sample 10/22/26")).toBe("2026-10-22");
    expect(installDateFromName("63929 Sample 10/8/2026")).toBe("2026-10-08");
    expect(installDateFromName("64358  Sample 10/13/26")).toBe("2026-10-13");
    expect(installDateFromName("59406/62203 Sample 11/05/26")).toBe("2026-11-05");
  });

  it("fills in a missing year from when the job was made", () => {
    expect(installDateFromName("64250 Sample 10/10", "2026-10-09T17:44:19Z")).toBe("2026-10-10");
    expect(installDateFromName("64250 Sample 1/5", "2026-11-20T10:00:00Z")).toBe("2027-01-05");
  });

  it("gives up when there is no real date", () => {
    expect(installDateFromName("64352 Sample FM NEEDED")).toBeNull();
    expect(installDateFromName("64352 Sample 2/30/26")).toBeNull();
  });
});

const job = (over: Partial<BoardJob>): BoardJob => ({
  jobtreadId: over.jobNumber ?? "x",
  jobNumber: "1",
  name: "",
  customer: "",
  city: "",
  stage: "Purchasing",
  stageSince: null,
  installOn: null,
  installFieldOn: null,
  installConfirmed: false,
  daysToInstall: null,
  production: [],
  materialsOrdered: null,
  materials: [],
  orderBy: null,
  past: false,
  risk: "ok",
  manager: null,
  ...over,
});

describe("report filters", () => {
  const jobs = [
    job({ jobNumber: "3", installOn: "2026-10-20", materials: ["Countertops - 4 weeks"], materialsOrdered: false }),
    job({ jobNumber: "1", installOn: "2026-10-15", materials: ["Lighting – 4 weeks"], materialsOrdered: true }),
    job({ jobNumber: "2", installOn: "2026-09-30", past: true, stage: "Complete", materials: ["Countertops - 4 weeks"] }),
  ];

  it("filters by material, date range and ordered", () => {
    const n = (p: Record<string, string | string[]>) => queryJobs(jobs, parseJobQuery(p)).map((j) => j.jobNumber);
    expect(n({})).toEqual(["1", "3"]);
    expect(n({ material: "Countertops - 4 weeks" })).toEqual(["3"]);
    expect(n({ material: "Countertops - 4 weeks", when: "all" })).toEqual(["3", "2"].reverse());
    expect(n({ when: "all", from: "2026-10-01", to: "2026-10-16" })).toEqual(["1"]);
    expect(n({ ordered: "no" })).toEqual(["3"]);
    expect(n({ when: "past" })).toEqual(["2"]);
    expect(n({ sort: "job" })).toEqual(["1", "3"]);
  });

  it("writes CSV that Excel reads", () => {
    const csv = toCsv([job({ jobNumber: "7", customer: "Doe, Jane", installOn: "2026-10-05" })], pickColumns(["install", "job", "customer"]));
    expect(csv).toBe('Install date,Job #,Customer\r\n10/5/26,7,"Doe, Jane"');
  });
});

describe("unsold tracker views", () => {
  it("sorts leads into upcoming, needs a result, and unsold", async () => {
    const { viewOf } = await import("@/lib/leads");
    const lead = (stage: string, apptOn: string | null) => ({ jobtreadId: "x", jobNumber: "1", name: "", customer: "", city: "", stage, stageSince: null, apptOn, createdAt: null });
    expect(viewOf(lead("Appt Set", "2026-10-20"), "2026-10-13")).toBe("upcoming");
    expect(viewOf(lead("Appt Set", "2026-10-01"), "2026-10-13")).toBe("result");
    expect(viewOf(lead("Appt Set", null), "2026-10-13")).toBe("result");
    expect(viewOf(lead("Unsold", "2026-10-01"), "2026-10-13")).toBe("unsold");
  });
});
