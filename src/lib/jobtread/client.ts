// Read-only client for JobTread's Pave API. The shop's rule is that the hub
// never changes anything in JobTread, so only these query roots are allowed and
// anything else (createJob, updateCustomFieldValue, ...) is refused before it is sent.
const READ_ROOTS = new Set(["$", "currentGrant", "organization", "customField", "job"]);

export type PaveQuery = Record<string, unknown>;
export type Pave = (query: PaveQuery) => Promise<any>;

export class JobTreadError extends Error {}

export function assertReadOnly(query: PaveQuery): void {
  for (const key of Object.keys(query)) {
    if (!READ_ROOTS.has(key)) throw new JobTreadError(`Refusing to send "${key}" to JobTread: the hub only reads.`);
  }
}

export function paveClient(grantKey: string, opts: { url?: string; fetchImpl?: typeof fetch } = {}): Pave {
  const url = opts.url ?? process.env.JOBTREAD_API_URL ?? "https://api.jobtread.com/pave";
  const doFetch = opts.fetchImpl ?? fetch;
  return async (query) => {
    assertReadOnly(query);
    const res = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: { $: { grantKey }, ...query } }),
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) throw new JobTreadError(`JobTread answered ${res.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  };
}
