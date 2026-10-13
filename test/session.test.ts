import { afterEach, describe, expect, it } from "vitest";
import { createSession, passwordMatches, validSession } from "@/lib/session";

describe("sign-in", () => {
  afterEach(() => {
    delete process.env.APP_PASSWORD;
  });

  it("checks the shared password", async () => {
    process.env.APP_PASSWORD = "shop123";
    expect(await passwordMatches("shop123")).toBe(true);
    expect(await passwordMatches("shop12")).toBe(false);
  });

  it("accepts its own session and rejects tampered or expired ones", async () => {
    process.env.APP_PASSWORD = "shop123";
    const now = Date.parse("2026-10-13T12:00:00Z");
    const token = await createSession(now);
    expect(await validSession(token, now)).toBe(true);
    expect(await validSession(token.replace(/.$/, (c) => (c === "0" ? "1" : "0")), now)).toBe(false);
    expect(await validSession(token, now + 31 * 864e5)).toBe(false);
    process.env.APP_PASSWORD = "changed";
    expect(await validSession(token, now)).toBe(false);
  });

  it("has no sessions when no password is set", async () => {
    expect(await validSession("1.abc")).toBe(false);
    expect(await passwordMatches("")).toBe(false);
  });
});

describe("local data folder", () => {
  it("stays out of the app folder", async () => {
    const { localDataDir } = await import("@/db");
    expect(localDataDir({ LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" }, "win32")).toContain("CBD Ops Hub");
    expect(localDataDir({ DATA_DIR: "/srv/hub" }, "linux")).toBe("/srv/hub/pglite");
    expect(localDataDir({}, "darwin")).toContain(".cbd-ops-hub");
  });
});
