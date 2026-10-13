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
  accessOf,
  assignJobs,
  deleteCategory,
  listCategories,
  ownJobNumbers,
  saveCategory,
  updateUser,
} from "@/lib/auth/accounts";
import { saveSnapshot } from "@/lib/import";
import { saveJobTreadSync, type JobTreadJob } from "@/lib/jobtread/sync";
import { parseSpecialOrders } from "@/lib/manager/parse";
import { accessFrom, can, canOpen } from "@/lib/auth/permissions";
import { readFileSync } from "node:fs";
import path from "node:path";

const lead: JobTreadJob = {
  jobtreadId: "x1", jobNumber: "", name: "", customer: "", city: "", stage: "Appt Set", stageSince: null, installOn: null, installFieldOn: null, apptOn: null,
  createdAt: null, installConfirmed: false, cncCutOn: null, edgeBandingOn: null, drawerAssemblyOn: null, finalQaOn: null, materialsOrdered: null, materials: [], orderBy: null, photographers: [],
};
const fixture = readFileSync(path.join(__dirname, "fixtures", "special-orders.tsv"), "utf8");

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

  it("invites staff with a one-time link and applies access changes at once", async () => {
    const db = await openDb("memory:");
    const admin = await createOwner(db, owner);
    const designer = (await listCategories(db)).find((c) => c.name === "Designer")!;
    const qa = (await listCategories(db)).find((c) => c.name === "QA")!;
    const { user, token } = await inviteUser(db, { email: "sam@example.com", name: "Sam", initials: "sm", role: "staff", categoryIds: [designer.id] }, admin.id);
    expect(user).toMatchObject({ initials: "SM", passwordHash: null });
    expect(await signInStaff(db, "sam@example.com", "")).toMatchObject({ ok: false });
    expect((await peekToken(db, token, ["staff_invite"]))?.user?.id).toBe(user.id);

    expect(await setPasswordWithToken(db, token, "short")).toMatchObject({ ok: false });
    const accepted = await setPasswordWithToken(db, token, "sams-new-password");
    expect(accepted.ok).toBe(true);
    // The link works once.
    expect(await setPasswordWithToken(db, token, "another-password")).toMatchObject({ ok: false });
    if (!accepted.ok) return;

    const before = await accountForSession(db, accepted.session);
    expect(before?.kind === "staff" && before.access.scope).toBe("own");
    // Adding a category that sees every job applies at once, without signing out.
    await updateUser(db, user.id, { email: "sam@example.com", name: "Sam", role: "staff", categoryIds: [designer.id, qa.id], active: true }, admin.id);
    const after = await accountForSession(db, accepted.session);
    expect(after?.kind === "staff" && after.access.scope).toBe("all");
    expect(after?.kind === "staff" && can(after.access, "qa.signoff")).toBe(true);

    await updateUser(db, user.id, { email: "sam@example.com", name: "Sam", role: "staff", categoryIds: [designer.id], active: false }, admin.id);
    expect(await accountForSession(db, accepted.session)).toBeNull();
    expect(await signInStaff(db, "sam@example.com", "sams-new-password")).toMatchObject({ ok: false });
  });

  it("keeps at least one active admin", async () => {
    const db = await openDb("memory:");
    const admin = await createOwner(db, owner);
    const [first] = await listCategories(db);
    await expect(updateUser(db, admin.id, { email: owner.email, name: owner.name, role: "staff", categoryIds: [first.id], active: true }, admin.id)).rejects.toThrow(/admin/);
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

describe("categories and own work", () => {
  it("starts with editable categories and won't delete one in use", async () => {
    const db = await openDb("memory:");
    const admin = await createOwner(db, owner);
    const names = (await listCategories(db)).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["Manager", "Designer", "Front office", "Installation"]));

    const lead = await saveCategory(db, null, { name: "Lead installer", permissions: ["jobs.view", "install.update", "not.a.permission"], jobScope: "all" }, admin.id);
    expect(lead.permissions).toEqual(["jobs.view", "install.update"]);
    const { user } = await inviteUser(db, { email: "ivan@example.com", name: "Ivan", role: "staff", categoryIds: [lead.id] }, admin.id);
    expect(can(await accessOf(db, user), "install.update")).toBe(true);
    await expect(deleteCategory(db, lead.id, admin.id)).rejects.toThrow(/Move everyone/);

    await saveCategory(db, lead.id, { name: "Lead installer", permissions: ["jobs.view"], jobScope: "all" }, admin.id);
    expect(can(await accessOf(db, user), "install.update")).toBe(false);
  });

  it("finds a designer's own jobs by name, assignment, client and paperwork", async () => {
    const db = await openDb("memory:");
    const admin = await createOwner(db, owner);
    await saveSnapshot(db, parseSpecialOrders(fixture));
    const designerName = (await db.query.jobs.findFirst())!.designer;
    const designer = (await listCategories(db)).find((c) => c.name === "Designer")!;
    const { user } = await inviteUser(db, { email: "d@example.com", name: "Dee", role: "staff", categoryIds: [designer.id], jobNames: [` ${designerName.toUpperCase()} `] }, admin.id);
    await assignJobs(db, user.id, ["70001"], admin.id);
    await createClient(db, { name: "C", jobNumbers: ["70002"], assignedUserId: user.id }, admin.id);
    await saveJobTreadSync(db, [{ ...lead, jobNumber: "70003", photographers: ["test designer", "Office"] }, { ...lead, jobtreadId: "x2", jobNumber: "70004", photographers: ["Office"] }]);
    const own = await ownJobNumbers(db, user);
    expect(own.has("70001")).toBe(true);
    expect(own.has("70002")).toBe(true);
    // Leads count as theirs when they took the photos in JobTread.
    expect(own.has("70003")).toBe(true);
    expect(own.has("70004")).toBe(false);
    expect([...own].some((n) => n.startsWith("5000"))).toBe(true);
  });
});

describe("permissions", () => {
  const designer = accessFrom("staff", [{ permissions: ["jobs.view", "paperwork.write", "unsold.view"], jobScope: "own" }]);
  const install = accessFrom("staff", [{ permissions: ["jobs.view", "install.update"], jobScope: "all" }]);
  const templates = accessFrom("staff", [{ permissions: ["pricebook.manage"], jobScope: "all" }]);

  it("combines categories", () => {
    expect(can(designer, "paperwork.write")).toBe(true);
    expect(can(install, "paperwork.write")).toBe(false);
    expect(designer.scope).toBe("own");
    expect(accessFrom("staff", [{ permissions: [], jobScope: "own" }, { permissions: [], jobScope: "all" }]).scope).toBe("all");
    expect(can(accessFrom("admin", []), "users.manage")).toBe(true);
  });

  it("maps pages to permissions", () => {
    expect(canOpen(install, "/")).toBe(true);
    expect(canOpen(install, "/admin/users")).toBe(false);
    expect(canOpen(install, "/paperwork")).toBe(false);
    expect(canOpen(designer, "/paperwork/12")).toBe(true);
    expect(canOpen(designer, "/paperwork/templates")).toBe(false);
    expect(canOpen(designer, "/paperwork/templates/3/file")).toBe(true);
    expect(canOpen(templates, "/paperwork/templates")).toBe(true);
    expect(canOpen(install, "/no-access")).toBe(true);
  });
});
