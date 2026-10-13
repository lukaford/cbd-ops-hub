import { describe, expect, it } from "vitest";
import { openDb } from "@/db";
import {
  accountForSession,
  checkPassword,
  clientLoginLink,
  createClient,
  createOwner,
  endSession,
  hashPassword,
  inviteUser,
  peekToken,
  setPasswordWithToken,
  signInClientWithToken,
  signInStaff,
  updateUser,
} from "@/lib/auth/accounts";
import { can, canOpen } from "@/lib/auth/permissions";

const owner = { name: "Luke Owner", email: "Owner@Example.com", password: "a-long-password" };

describe("passwords", () => {
  it("hashes with a salt and checks", async () => {
    const a = await hashPassword("correct horse");
    expect(a).not.toBe(await hashPassword("correct horse"));
    expect(await checkPassword("correct horse", a)).toBe(true);
    expect(await checkPassword("wrong horse", a)).toBe(false);
    expect(await checkPassword("anything", null)).toBe(false);
  });
});

describe("staff accounts", () => {
  it("signs the owner in by email in any case and rejects a wrong password", async () => {
    const db = await openDb("memory:");
    await createOwner(db, owner);
    const bad = await signInStaff(db, "owner@example.com", "nope");
    expect(bad.ok).toBe(false);
    const good = await signInStaff(db, " OWNER@example.com ", owner.password);
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    const account = await accountForSession(db, good.session);
    expect(account).toMatchObject({ kind: "staff", user: { email: "owner@example.com", role: "admin" } });
    await endSession(db, good.session);
    expect(await accountForSession(db, good.session)).toBeNull();
  });

  it("locks an email after repeated failures", async () => {
    const db = await openDb("memory:");
    await createOwner(db, owner);
    for (let i = 0; i < 10; i++) await signInStaff(db, owner.email, "wrong");
    const r = await signInStaff(db, owner.email, owner.password);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Too many/) });
  });

  it("invites staff with a one-time link and signs them out when access changes", async () => {
    const db = await openDb("memory:");
    const admin = await createOwner(db, owner);
    const { user, token } = await inviteUser(db, { email: "sam@example.com", name: "Sam", initials: "sm", role: "staff", departments: ["designer"] }, admin.id);
    expect(user).toMatchObject({ initials: "SM", passwordHash: null });
    expect(await signInStaff(db, "sam@example.com", "")).toMatchObject({ ok: false });
    expect((await peekToken(db, token, ["staff_invite"]))?.user?.id).toBe(user.id);

    expect(await setPasswordWithToken(db, token, "short")).toMatchObject({ ok: false });
    const accepted = await setPasswordWithToken(db, token, "sams-new-password");
    expect(accepted.ok).toBe(true);
    // The link works once.
    expect(await setPasswordWithToken(db, token, "another-password")).toMatchObject({ ok: false });
    if (!accepted.ok) return;

    await updateUser(db, user.id, { email: "sam@example.com", name: "Sam", role: "staff", departments: ["sales", "qa"], active: true }, admin.id);
    expect(await accountForSession(db, accepted.session)).toBeNull();

    const again = await signInStaff(db, "sam@example.com", "sams-new-password");
    expect(again.ok).toBe(true);
    await updateUser(db, user.id, { email: "sam@example.com", name: "Sam", role: "staff", departments: ["sales"], active: false }, admin.id);
    expect(await signInStaff(db, "sam@example.com", "sams-new-password")).toMatchObject({ ok: false });
  });

  it("keeps at least one active admin", async () => {
    const db = await openDb("memory:");
    const admin = await createOwner(db, owner);
    await expect(updateUser(db, admin.id, { email: owner.email, name: owner.name, role: "staff", departments: ["sales"], active: true }, admin.id)).rejects.toThrow(/admin/);
  });
});

describe("client sign-in links", () => {
  it("signs a client in once and only while the link is the newest", async () => {
    const db = await openDb("memory:");
    const admin = await createOwner(db, owner);
    const client = await createClient(db, { name: "Pat Client", email: "Pat@Example.com", jobNumbers: ["51234", " 51234", "51240"] }, admin.id);
    expect(client.email).toBe("pat@example.com");

    const first = await clientLoginLink(db, client.id, admin.id);
    const second = await clientLoginLink(db, client.id, admin.id);
    expect(await signInClientWithToken(db, first)).toBeNull();
    const signedIn = await signInClientWithToken(db, second);
    expect(signedIn?.client.id).toBe(client.id);
    expect(await signInClientWithToken(db, second)).toBeNull();
    expect(await accountForSession(db, signedIn!.session)).toMatchObject({ kind: "client", client: { id: client.id } });
  });
});

describe("permissions", () => {
  const sales = { role: "staff", departments: ["designer"] };
  const install = { role: "staff", departments: ["installation"] };

  it("gives departments their own work and everyone the basics", () => {
    expect(can(sales, "paperwork.write")).toBe(true);
    expect(can(install, "paperwork.write")).toBe(false);
    expect(can({ role: "staff", departments: ["sales"] }, "paperwork.write")).toBe(false);
    expect(can({ role: "staff", departments: ["sales"] }, "clients.manage")).toBe(true);
    expect(can(install, "jobs.view")).toBe(true);
    expect(can({ role: "manager", departments: [] }, "paperwork.write")).toBe(true);
    expect(can({ role: "manager", departments: [] }, "users.manage")).toBe(false);
    expect(can({ role: "admin", departments: [] }, "users.manage")).toBe(true);
  });

  it("maps pages to permissions", () => {
    expect(canOpen(install, "/")).toBe(true);
    expect(canOpen(install, "/admin/users")).toBe(false);
    expect(canOpen(install, "/paperwork")).toBe(false);
    expect(canOpen(sales, "/paperwork/12")).toBe(true);
    expect(canOpen(sales, "/paperwork/templates")).toBe(false);
    expect(canOpen(sales, "/paperwork/templates/3/file")).toBe(true);
    expect(canOpen({ role: "staff", departments: ["price_verification"] }, "/paperwork/templates")).toBe(true);
  });
});
