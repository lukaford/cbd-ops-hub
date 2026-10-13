import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, asc, count, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { auditEvents, authSessions, authTokens, clientJobs, clients, jobAssignments, jobs, paperworkPackets, staffCategories, userCategories, users } from "@/db/schema";
import { accessFrom, DEFAULT_CATEGORIES, isPermission, type Access, type JobScope } from "./permissions";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;

export const STAFF_SESSION_DAYS = 30;
export const CLIENT_SESSION_DAYS = 90;
export const MIN_PASSWORD = 10;

const TOKEN_HOURS = { staff_invite: 7 * 24, password_reset: 2, client_login: 72 } as const;
export type TokenPurpose = keyof typeof TOKEN_HOURS;

export type StaffUser = typeof users.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Category = typeof staffCategories.$inferSelect;
export type Account = { kind: "staff"; user: StaffUser; access: Access } | { kind: "client"; client: Client };

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

// ---- Passwords: scrypt with a per-password salt, parameters stored alongside.

const SCRYPT = { N: 16384, r: 8, p: 1 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function checkPassword(password: string, stored: string | null): Promise<boolean> {
  const parts = stored?.split("$") ?? [];
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    // Spend the same time as a real check so a missing account isn't detectable.
    await scrypt(password, randomBytes(16), 32, SCRYPT);
    return false;
  }
  const [, N, r, p, salt, key] = parts;
  const want = Buffer.from(key, "base64");
  const got = await scrypt(password, Buffer.from(salt, "base64"), want.length, { N: Number(N), r: Number(r), p: Number(p) });
  return timingSafeEqual(got, want);
}

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  return null;
}

// ---- Random tokens. Only their SHA-256 is stored, so a database copy can't sign anyone in.

export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const daysFrom = (now: Date, days: number) => new Date(now.getTime() + days * 864e5);

// ---- Audit trail

export async function audit(
  db: Db,
  event: { action: string; userId?: number | null; clientId?: number | null; entity?: string; entityId?: string | number; data?: object; ip?: string },
) {
  await db.insert(auditEvents).values({
    action: event.action,
    actorUserId: event.userId ?? null,
    actorClientId: event.clientId ?? null,
    entity: event.entity ?? "",
    entityId: event.entityId === undefined ? "" : String(event.entityId),
    data: event.data ?? {},
    ip: event.ip ?? "",
  });
}

// ---- Staff accounts

export async function countUsers(db: Db): Promise<number> {
  const [row] = await db.select({ n: count() }).from(users);
  return row.n;
}

export type StaffInput = { email: string; name: string; initials?: string; role: string; categoryIds: number[]; jobNames?: string[] };

export function staffInputProblem(input: StaffInput): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(input.email))) return "Enter a valid email address.";
  if (!input.name.trim()) return "Enter their name.";
  if (input.role !== "admin" && input.role !== "staff") return "Pick admin or staff.";
  if (input.role === "staff" && input.categoryIds.length === 0) return "Put them in at least one category.";
  return null;
}

function staffValues(input: StaffInput) {
  return {
    email: normalizeEmail(input.email),
    name: input.name.trim(),
    initials: (input.initials ?? "").trim().toUpperCase(),
    role: input.role,
    jobNames: [...new Set((input.jobNames ?? []).map((n) => n.trim()).filter(Boolean))],
  };
}

async function setCategories(db: Db, userId: number, categoryIds: number[]) {
  await db.delete(userCategories).where(eq(userCategories.userId, userId));
  const ids = [...new Set(categoryIds)];
  if (ids.length) await db.insert(userCategories).values(ids.map((categoryId) => ({ userId, categoryId })));
}

export async function categoriesOf(db: Db, userId: number): Promise<Category[]> {
  return db
    .select({ category: staffCategories })
    .from(userCategories)
    .innerJoin(staffCategories, eq(staffCategories.id, userCategories.categoryId))
    .where(eq(userCategories.userId, userId))
    .then((rows) => rows.map((r) => r.category));
}

export async function accessOf(db: Db, user: StaffUser): Promise<Access> {
  return accessFrom(user.role, await categoriesOf(db, user.id));
}

// The first account, made from the setup page, is an admin with a password.
export async function createOwner(db: Db, input: { email: string; name: string; password: string }): Promise<StaffUser> {
  const [user] = await db
    .insert(users)
    .values({ ...staffValues({ ...input, role: "admin", categoryIds: [] }), passwordHash: await hashPassword(input.password) })
    .returning();
  if ((await listCategories(db)).length === 0) {
    await db.insert(staffCategories).values(DEFAULT_CATEGORIES.map((c, position) => ({ ...c, position })));
  }
  await audit(db, { action: "owner_created", userId: user.id, entity: "user", entityId: user.id });
  return user;
}

// Everyone else is invited: the account exists without a password until they open the link.
export async function inviteUser(db: Db, input: StaffInput, byUserId: number): Promise<{ user: StaffUser; token: string }> {
  const [user] = await db.insert(users).values(staffValues(input)).returning();
  await setCategories(db, user.id, input.categoryIds);
  const token = await issueToken(db, "staff_invite", { userId: user.id }, byUserId);
  await audit(db, { action: "user_invited", userId: byUserId, entity: "user", entityId: user.id, data: { role: user.role, categoryIds: input.categoryIds } });
  return { user, token };
}

export async function updateUser(db: Db, id: number, input: StaffInput & { active: boolean }, byUserId: number): Promise<void> {
  const before = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!before) throw new Error("No such user.");
  const after = { ...staffValues(input), active: input.active };
  if (before.role === "admin" && (after.role !== "admin" || !after.active) && (await activeAdmins(db)) <= 1) {
    throw new Error("Keep at least one active admin.");
  }
  await db.update(users).set(after).where(eq(users.id, id));
  await setCategories(db, id, input.role === "admin" ? [] : input.categoryIds);
  // Access is worked out on every request, so changes apply at once; switching
  // someone off also signs them out everywhere.
  if (!after.active) await db.delete(authSessions).where(eq(authSessions.userId, id));
  await audit(db, {
    action: "user_updated",
    userId: byUserId,
    entity: "user",
    entityId: id,
    data: { role: after.role, categoryIds: input.categoryIds, active: after.active },
  });
}

async function activeAdmins(db: Db): Promise<number> {
  const [row] = await db.select({ n: count() }).from(users).where(and(eq(users.role, "admin"), eq(users.active, true)));
  return row.n;
}

export async function passwordResetLink(db: Db, userId: number, byUserId: number): Promise<string> {
  const token = await issueToken(db, "password_reset", { userId }, byUserId);
  await audit(db, { action: "password_reset_created", userId: byUserId, entity: "user", entityId: userId });
  return token;
}

const FAILED_LIMIT = 10;
const FAILED_WINDOW_MIN = 15;

export type SignInResult = { ok: true; user: StaffUser; session: string } | { ok: false; error: string };

export async function signInStaff(db: Db, emailInput: string, password: string, meta: { ip?: string; userAgent?: string } = {}): Promise<SignInResult> {
  const email = normalizeEmail(emailInput);
  const since = new Date(Date.now() - FAILED_WINDOW_MIN * 60e3);
  const [recent] = await db
    .select({ n: count() })
    .from(auditEvents)
    .where(and(eq(auditEvents.action, "sign_in_failed"), eq(auditEvents.entityId, email), gt(auditEvents.at, since)));
  if (recent.n >= FAILED_LIMIT) return { ok: false, error: "Too many tries. Wait 15 minutes and try again." };

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  const good = await checkPassword(password, user?.passwordHash ?? null);
  if (!user || !good || !user.active) {
    await audit(db, { action: "sign_in_failed", userId: user?.id, entity: "email", entityId: email, ip: meta.ip });
    return { ok: false, error: "That email and password don't match an active account." };
  }
  await db.update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, user.id));
  await audit(db, { action: "sign_in", userId: user.id, ip: meta.ip });
  return { ok: true, user, session: await startSession(db, { userId: user.id }, meta.userAgent) };
}

// Invite and reset links both end here: set the password and sign in.
export async function setPasswordWithToken(db: Db, token: string, password: string, meta: { ip?: string; userAgent?: string } = {}): Promise<SignInResult> {
  const problem = passwordProblem(password);
  if (problem) return { ok: false, error: problem };
  const row = await useToken(db, token, ["staff_invite", "password_reset"]);
  if (!row?.userId) return { ok: false, error: "This link has expired or was already used. Ask an admin for a new one." };
  const [user] = await db.update(users).set({ passwordHash: await hashPassword(password), lastSignInAt: new Date() }).where(eq(users.id, row.userId)).returning();
  if (!user.active) return { ok: false, error: "This account is switched off." };
  // A new password signs out every other browser.
  await db.delete(authSessions).where(eq(authSessions.userId, user.id));
  await audit(db, { action: row.purpose === "staff_invite" ? "invite_accepted" : "password_reset", userId: user.id, ip: meta.ip });
  return { ok: true, user, session: await startSession(db, { userId: user.id }, meta.userAgent) };
}

// ---- Categories

export async function listCategories(db: Db): Promise<Category[]> {
  return db.select().from(staffCategories).orderBy(asc(staffCategories.position), asc(staffCategories.name));
}

export type CategoryInput = { name: string; description?: string; permissions: string[]; jobScope: string };

export async function saveCategory(db: Db, id: number | null, input: CategoryInput, byUserId: number): Promise<Category> {
  const name = input.name.trim();
  if (!name) throw new Error("Give the category a name.");
  const values = {
    name,
    description: (input.description ?? "").trim(),
    permissions: [...new Set(input.permissions.filter(isPermission))],
    jobScope: (input.jobScope === "own" ? "own" : "all") as JobScope,
  };
  let category: Category;
  if (id) {
    [category] = await db.update(staffCategories).set(values).where(eq(staffCategories.id, id)).returning();
  } else {
    const [{ n }] = await db.select({ n: count() }).from(staffCategories);
    [category] = await db.insert(staffCategories).values({ ...values, position: n }).returning();
  }
  await audit(db, { action: id ? "category_updated" : "category_created", userId: byUserId, entity: "category", entityId: category.id, data: values });
  return category;
}

export async function deleteCategory(db: Db, id: number, byUserId: number) {
  const [{ n }] = await db.select({ n: count() }).from(userCategories).where(eq(userCategories.categoryId, id));
  if (n > 0) throw new Error("Move everyone out of this category first.");
  const [gone] = await db.delete(staffCategories).where(eq(staffCategories.id, id)).returning();
  if (gone) await audit(db, { action: "category_deleted", userId: byUserId, entity: "category", entityId: id, data: { name: gone.name } });
}

// ---- Own jobs, for people whose categories only see their own work

export async function assignJobs(db: Db, userId: number, jobNumbers: string[], byUserId: number | null) {
  const unique = [...new Set(jobNumbers.map((j) => j.trim()).filter(Boolean))];
  await db.delete(jobAssignments).where(eq(jobAssignments.userId, userId));
  if (unique.length) await db.insert(jobAssignments).values(unique.map((jobNumber) => ({ userId, jobNumber, createdByUserId: byUserId })));
}

export async function assignedJobNumbers(db: Db, userId: number): Promise<string[]> {
  const rows = await db.select({ n: jobAssignments.jobNumber }).from(jobAssignments).where(eq(jobAssignments.userId, userId)).orderBy(jobAssignments.jobNumber);
  return rows.map((r) => r.n);
}

// A job is someone's own when their name is on it (Manager's DESIGNER column or
// the paperwork's designer), it was assigned to them, it belongs to one of their
// clients, or they started paperwork for it.
export async function ownJobNumbers(db: Db, user: StaffUser): Promise<Set<string>> {
  const names = user.jobNames.map((n) => n.trim().toLowerCase()).filter(Boolean);
  const byName = names.length
    ? [
        db.select({ n: jobs.jobNumber }).from(jobs).where(inArray(sql`lower(trim(${jobs.designer}))`, names)),
        db.select({ n: paperworkPackets.jobNumber }).from(paperworkPackets).where(inArray(sql`lower(trim(${paperworkPackets.designer}))`, names)),
      ]
    : [];
  const lists = await Promise.all([
    ...byName,
    db.select({ n: jobAssignments.jobNumber }).from(jobAssignments).where(eq(jobAssignments.userId, user.id)),
    db.select({ n: clientJobs.jobNumber }).from(clientJobs).innerJoin(clients, eq(clients.id, clientJobs.clientId)).where(eq(clients.assignedUserId, user.id)),
    db.select({ n: paperworkPackets.jobNumber }).from(paperworkPackets).where(eq(paperworkPackets.createdByUserId, user.id)),
  ]);
  return new Set(lists.flat().map((r) => r.n));
}

// ---- Clients

export type ClientInput = { name: string; email?: string; phone?: string; jobNumbers: string[]; assignedUserId?: number | null };

export async function createClient(db: Db, input: ClientInput, byUserId: number | null): Promise<Client> {
  const email = input.email?.trim() ? normalizeEmail(input.email) : null;
  const [client] = await db
    .insert(clients)
    .values({ name: input.name.trim(), email, phone: (input.phone ?? "").trim(), assignedUserId: input.assignedUserId ?? null, createdByUserId: byUserId })
    .returning();
  await linkJobs(db, client.id, input.jobNumbers);
  await audit(db, { action: "client_created", userId: byUserId, entity: "client", entityId: client.id });
  return client;
}

export async function linkJobs(db: Db, clientId: number, jobNumbers: string[]) {
  const unique = [...new Set(jobNumbers.map((j) => j.trim()).filter(Boolean))];
  if (unique.length === 0) return;
  await db
    .insert(clientJobs)
    .values(unique.map((jobNumber) => ({ clientId, jobNumber })))
    .onConflictDoNothing();
}

export async function clientJobNumbers(db: Db, clientId: number): Promise<string[]> {
  const rows = await db.select({ jobNumber: clientJobs.jobNumber }).from(clientJobs).where(eq(clientJobs.clientId, clientId)).orderBy(clientJobs.jobNumber);
  return rows.map((r) => r.jobNumber);
}

// A staff member makes a sign-in link to text, email or show as a QR code.
export async function clientLoginLink(db: Db, clientId: number, byUserId: number | null): Promise<string> {
  const token = await issueToken(db, "client_login", { clientId }, byUserId);
  await audit(db, { action: "client_link_created", userId: byUserId, clientId: byUserId ? null : clientId, entity: "client", entityId: clientId });
  return token;
}

export async function findClientByEmail(db: Db, emailInput: string): Promise<Client | undefined> {
  return db.query.clients.findFirst({ where: and(eq(clients.email, normalizeEmail(emailInput)), eq(clients.active, true)) });
}

export async function signInClientWithToken(db: Db, token: string, meta: { ip?: string; userAgent?: string } = {}): Promise<{ client: Client; session: string } | null> {
  const row = await useToken(db, token, ["client_login"]);
  if (!row?.clientId) return null;
  const [client] = await db.update(clients).set({ lastSignInAt: new Date() }).where(and(eq(clients.id, row.clientId), eq(clients.active, true))).returning();
  if (!client) return null;
  await audit(db, { action: "client_sign_in", clientId: client.id, ip: meta.ip });
  return { client, session: await startSession(db, { clientId: client.id }, meta.userAgent) };
}

// ---- One-time tokens and sessions

async function issueToken(db: Db, purpose: TokenPurpose, owner: { userId?: number; clientId?: number }, byUserId: number | null): Promise<string> {
  const token = newToken();
  // Only the newest link of each kind works.
  const ownerMatch = owner.userId ? eq(authTokens.userId, owner.userId) : eq(authTokens.clientId, owner.clientId!);
  await db.update(authTokens).set({ usedAt: new Date() }).where(and(ownerMatch, eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)));
  await db.insert(authTokens).values({
    tokenHash: hashToken(token),
    purpose,
    userId: owner.userId ?? null,
    clientId: owner.clientId ?? null,
    createdByUserId: byUserId,
    expiresAt: new Date(Date.now() + TOKEN_HOURS[purpose] * 3600e3),
  });
  return token;
}

// Marks the token used in the same statement that checks it, so a link works once.
async function useToken(db: Db, token: string, purposes: TokenPurpose[]) {
  const [row] = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.tokenHash, hashToken(token)), inArray(authTokens.purpose, purposes), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
    .returning();
  return row;
}

// Checks a token without using it, so a page can say up front whether the link still works.
export async function peekToken(db: Db, token: string, purposes: TokenPurpose[]) {
  const row = await db.query.authTokens.findFirst({
    where: and(eq(authTokens.tokenHash, hashToken(token)), inArray(authTokens.purpose, purposes), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())),
  });
  if (!row?.userId) return row ? { purpose: row.purpose, user: null } : null;
  return { purpose: row.purpose, user: (await db.query.users.findFirst({ where: eq(users.id, row.userId) })) ?? null };
}

async function startSession(db: Db, owner: { userId?: number; clientId?: number }, userAgent = ""): Promise<string> {
  const token = newToken();
  const days = owner.userId ? STAFF_SESSION_DAYS : CLIENT_SESSION_DAYS;
  await db.insert(authSessions).values({
    tokenHash: hashToken(token),
    userId: owner.userId ?? null,
    clientId: owner.clientId ?? null,
    expiresAt: daysFrom(new Date(), days),
    userAgent: userAgent.slice(0, 300),
  });
  return token;
}

export async function accountForSession(db: Db, token: string | undefined): Promise<Account | null> {
  if (!token) return null;
  const session = await db.query.authSessions.findFirst({
    where: and(eq(authSessions.tokenHash, hashToken(token)), gt(authSessions.expiresAt, new Date())),
  });
  if (!session) return null;
  if (session.userId) {
    const user = await db.query.users.findFirst({ where: and(eq(users.id, session.userId), eq(users.active, true)) });
    return user ? { kind: "staff", user, access: await accessOf(db, user) } : null;
  }
  const client = await db.query.clients.findFirst({ where: and(eq(clients.id, session.clientId!), eq(clients.active, true)) });
  return client ? { kind: "client", client } : null;
}

export async function endSession(db: Db, token: string | undefined) {
  if (token) await db.delete(authSessions).where(eq(authSessions.tokenHash, hashToken(token)));
}

export async function pruneExpired(db: Db) {
  await db.delete(authSessions).where(sql`${authSessions.expiresAt} < now()`);
  await db.delete(authTokens).where(sql`${authTokens.expiresAt} < now() - interval '30 days'`);
}
