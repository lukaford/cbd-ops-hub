// Sold jobs carry their install date at the end of the JobTread job name,
// e.g. "63931 Janelli 10/22/26", "63929 Doherty 10/8/2026" or "64250 Hardin 10/10".
// (Before a job is sold the same spot holds the appointment date, so callers
// only use this for sold jobs.)
const DATE_IN_NAME = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2})(?!\d))?(?!.*\d{1,2}\/\d{1,2})/;

export function installDateFromName(name: string, createdAt?: string | Date | null): string | null {
  const m = DATE_IN_NAME.exec(name);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year: number;
  if (m[3]) {
    year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  } else {
    // No year: take the one that puts the date nearest after the job was created.
    const ref = createdAt ? new Date(createdAt) : new Date();
    year = ref.getUTCFullYear();
    const candidate = Date.UTC(year, month - 1, day);
    if (candidate < ref.getTime() - 60 * 864e5) year += 1;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1) return null; // e.g. 2/30
  return d.toISOString().slice(0, 10);
}
