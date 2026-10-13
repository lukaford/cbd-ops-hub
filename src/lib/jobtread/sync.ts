import type { Db } from "@/db";
import { jobtreadJobs, jobtreadSyncs } from "@/db/schema";
import type { Pave } from "./client";
import { ACTIVE_STAGES, FIELD, FIELD_IDS } from "./fields";

export interface JobTreadJob {
  jobtreadId: string;
  jobNumber: string;
  name: string;
  customer: string;
  city: string;
  stage: string | null;
  stageSince: Date | null; // JobTread replaces the value when the stage changes, so its createdAt is when it was set
  installOn: string | null;
  installConfirmed: boolean;
  cncCutOn: string | null;
  edgeBandingOn: string | null;
  drawerAssemblyOn: string | null;
  finalQaOn: string | null;
  materialsOrdered: boolean | null;
}

const PAGE = 100;
// Jobs whose install date passed more than this many days ago drop off unless their stage keeps them on.
const RECENT_INSTALL_DAYS = 7;

async function valueJobIds(pave: Pave, fieldId: string, where: unknown[]): Promise<string[]> {
  const ids: string[] = [];
  let page: string | undefined;
  do {
    const res = await pave({
      customField: {
        $: { id: fieldId },
        customFieldValues: {
          $: { size: PAGE, where, ...(page ? { page } : {}) },
          nextPage: {},
          nodes: { job: { id: {} } },
        },
      },
    });
    const conn = res.customField.customFieldValues;
    for (const n of conn.nodes) if (n.job?.id) ids.push(n.job.id);
    page = conn.nextPage ?? undefined;
  } while (page);
  return ids;
}

function isoDate(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export function toJob(node: any): JobTreadJob {
  const values = new Map<string, { value: unknown; createdAt: string }>();
  for (const v of node.customFieldValues?.nodes ?? []) values.set(v.customField.id, v);
  const get = (id: string) => values.get(id)?.value;
  const stage = values.get(FIELD.status2);
  const ordered = get(FIELD.materialsOrdered);
  return {
    jobtreadId: node.id,
    jobNumber: String(node.number ?? ""),
    name: node.name ?? "",
    customer: node.location?.account?.name ?? "",
    city: node.location?.city ?? "",
    stage: typeof stage?.value === "string" && stage.value ? stage.value : null,
    stageSince: stage?.createdAt ? new Date(stage.createdAt) : null,
    installOn: isoDate(get(FIELD.installOn)),
    installConfirmed: get(FIELD.installConfirmed) === true,
    cncCutOn: isoDate(get(FIELD.cncCutOn)),
    edgeBandingOn: isoDate(get(FIELD.edgeBandingOn)),
    drawerAssemblyOn: isoDate(get(FIELD.drawerAssemblyOn)),
    finalQaOn: isoDate(get(FIELD.finalQaOn)),
    materialsOrdered: typeof ordered === "boolean" ? ordered : null,
  };
}

// Jobs that are sold and not complete (by Status 2.0), plus any job with an
// upcoming Confirmed Install Date. Reads only.
export async function fetchJobTreadJobs(pave: Pave, today: string): Promise<JobTreadJob[]> {
  const since = new Date(Date.parse(today) - RECENT_INSTALL_DAYS * 864e5).toISOString().slice(0, 10);
  const [staged, installing] = await Promise.all([
    valueJobIds(pave, FIELD.status2, ["value", "in", ACTIVE_STAGES]),
    valueJobIds(pave, FIELD.installOn, ["dateValue", ">=", since]),
  ]);
  const ids = [...new Set([...staged, ...installing])];
  if (!ids.length) return [];

  const { currentGrant } = await pave({ currentGrant: { organization: { id: {} } } });
  const orgId = currentGrant.organization.id;

  const jobs: JobTreadJob[] = [];
  for (let i = 0; i < ids.length; i += PAGE) {
    const res = await pave({
      organization: {
        $: { id: orgId },
        jobs: {
          $: { size: PAGE, where: ["id", "in", ids.slice(i, i + PAGE)] },
          nodes: {
            id: {},
            number: {},
            name: {},
            location: { city: {}, account: { name: {} } },
            customFieldValues: {
              $: { size: 25, where: [["customField", "id"], "in", FIELD_IDS] },
              nodes: { value: {}, createdAt: {}, customField: { id: {} } },
            },
          },
        },
      },
    });
    for (const node of res.organization.jobs.nodes) jobs.push(toJob(node));
  }
  // A job that left the board between the two reads (e.g. marked Complete) has no stage and no upcoming date.
  return jobs.filter((j) => (j.stage && ACTIVE_STAGES.includes(j.stage)) || (j.installOn && j.installOn >= since));
}

// Replaces the stored copy with what JobTread says now.
export async function saveJobTreadSync(db: Db, jobs: JobTreadJob[]): Promise<{ id: number; jobCount: number }> {
  return db.transaction(async (tx) => {
    const [sync] = await tx.insert(jobtreadSyncs).values({ jobCount: jobs.length }).returning();
    await tx.delete(jobtreadJobs);
    if (jobs.length) await tx.insert(jobtreadJobs).values(jobs.map((j) => ({ ...j, syncId: sync.id })));
    return { id: sync.id, jobCount: jobs.length };
  });
}
