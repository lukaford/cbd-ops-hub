import type { Db } from "@/db";
import { jobtreadJobs, jobtreadSyncs } from "@/db/schema";
import type { Pave } from "./client";
import { ACTIVE_STAGES, COMPLETE, FIELD, FIELD_IDS } from "./fields";

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
  materials: string[];
  orderBy: string | null;
}

const PAGE = 100;
const BOARD_STAGES = [...ACTIVE_STAGES, COMPLETE];

async function valueJobIds(pave: Pave, fieldId: string, where?: unknown[]): Promise<string[]> {
  const ids: string[] = [];
  let page: string | undefined;
  do {
    const res = await pave({
      customField: {
        $: { id: fieldId },
        customFieldValues: {
          $: { size: PAGE, ...(where ? { where } : {}), ...(page ? { page } : {}) },
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
  const materials: string[] = [];
  for (const v of node.customFieldValues?.nodes ?? []) {
    if (v.customField.id === FIELD.materials) {
      if (typeof v.value === "string" && v.value) materials.push(v.value);
    } else values.set(v.customField.id, v);
  }
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
    materials: [...new Set(materials)],
    orderBy: isoDate(get(FIELD.orderBy)),
  };
}

// Every sold job (Status 2.0 from Sold through Complete), plus any job with a
// Confirmed Install Date or a Material Type, past or upcoming. Reads only.
export async function fetchJobTreadJobs(pave: Pave): Promise<JobTreadJob[]> {
  const [staged, installing, withMaterials] = await Promise.all([
    valueJobIds(pave, FIELD.status2, ["value", "in", BOARD_STAGES]),
    valueJobIds(pave, FIELD.installOn),
    valueJobIds(pave, FIELD.materials),
  ]);
  const ids = [...new Set([...staged, ...installing, ...withMaterials])];
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
              $: { size: 40, where: [["customField", "id"], "in", FIELD_IDS] },
              nodes: { value: {}, createdAt: {}, customField: { id: {} } },
            },
          },
        },
      },
    });
    for (const node of res.organization.jobs.nodes) jobs.push(toJob(node));
  }
  // Leads and unsold jobs stay off even if someone filled in a date or material.
  return jobs.filter((j) => (j.stage ? BOARD_STAGES.includes(j.stage) : Boolean(j.installOn || j.materials.length)));
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
