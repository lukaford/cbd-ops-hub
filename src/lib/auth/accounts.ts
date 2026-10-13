import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, count, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { auditEvents, authSessions, authTokens, clientJobs, clients, users } from "@/db/schema";
import { isDepartment, isRole } from "./permissions";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;

export const STAFF_SESSION_DAYS = 30;
export const CLIENT_SESSION_DAYS = 90;
export const MIN_PASSWORD = 10;

const TOKEN_HOURS = { staff_invite: 7 * 24, password_reset: 2, client_login: 72 } as const;
export type TokenPurpose = keyof typeof TOKEN_HOURS;

export type StaffUser = typeof users.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Account = { kind: "staff"; user: StaffUser } | { kind: "client"; client: Client };

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

export type StaffInput = { email: string; name: string; initials?: string; role: string; departments: string[] };

export function staffInputProblem(input: StaffInput): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(input.email))) return "Enter a valid email address.";
  if (!input.name.trim()) return "Enter their name.";
  if (!isRole(input.role)) return "Pick a role.";
  if (!input.departments.every(isDepartment)) return "Unknown department.";
  if (input.role === "staff" && input.departments.length === 0) return "Pick at least one department for staff.";
  return null;
}

function staffValues(input: StaffInput) {
  return {
    email: normalizeEmail(input.email),
    name: input.name.trim(),
    initials: (input.initials ?? "").trim().toUpperCase(),
    role: input.role,
    departments: [...new Set(input.departments)],
  };
}

// The first account, made from the setup page, is an admin with a password.
export async function createOwner(db: Db, input: { email: string; name: string; password: string }): Promise<StaffUser> {
  const [user] = await db
    .insert(users)
    .values({ ...staffValues({ ...input, role: "admin", departments: [] }), passwordHash: await hashPassword(input.password) })
    .returning();
  await audit(db, { action: "owner_created", userId: user.id, entity: "user", entityId: user.id });
  return user;
}

// Everyone else is invited: the account exists without a password until they open the link.
export async function inviteUser(db: Db, input: StaffInput, byUserId: number): Promise<{ user: StaffUser; token: string }> {
  const [user] = await db.insert(users).values(staffValues(input)).returning();
  const token = await issueToken(db, "staff_invite", { userId: user.id }, byUserId);
  await audit(db, { action: "user_invited", userId: byUserId, entity: "user", entityId: user.id, data: { role: user.role, departments: user.departments } });
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
  // Access changes take effect at once: sign them out everywhere.
  if (!after.active || before.role !== after.role || before.departments.join() !== after.departments.join()) {
    await db.delete(authSessions).where(eq(authSessions.userId, id));
  }
  await audit(db, {
    action: "user_updated",
    userId: byUserId,
    entity: "user",
    entityId: id,
    data: { role: after.role, departments: after.departments, active: after.active },
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

// ---- Clients

export type ClientInput = { name: string; email?: string; phone?: string; jobNumbers: string[] };

export async function createClient(db: Db, input: ClientInput, byUserId: number | null): Promise<Client> {
  const email = input.email?.trim() ? normalizeEmail(input.email) : null;
  const [client] = await db
    .insert(clients)
    .values({ name: input.name.trim(), email, phone: (input.phone ?? "").trim(), createdByUserId: byUserId })
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
    return user ? { kind: "staff", user } : null;
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
