import { describe, expect, it } from "vitest";
import { lanAddress, linkOrigin } from "@/lib/auth/linkOrigin";

describe("links sent to other people", () => {
  it("swaps localhost for this computer's network address", () => {
    expect(linkOrigin("http://localhost:3000", undefined, "10.1.11.208")).toBe("http://10.1.11.208:3000");
    expect(linkOrigin("http://127.0.0.1:3000", undefined, "10.1.11.208")).toBe("http://10.1.11.208:3000");
  });
  it("keeps a real address, and APP_URL wins", () => {
    expect(linkOrigin("http://10.1.11.208:3000", undefined, "10.1.11.208")).toBe("http://10.1.11.208:3000");
    expect(linkOrigin("https://hub.example.com", undefined, "10.0.0.5")).toBe("https://hub.example.com");
    expect(linkOrigin("http://localhost:3000", "https://hub.example.com/", "10.0.0.5")).toBe("https://hub.example.com");
  });
  it("keeps localhost when the computer has no network", () => {
    expect(linkOrigin("http://localhost:3000", undefined, null)).toBe("http://localhost:3000");
  });
  it("picks an outside IPv4 address", () => {
    const nets = {
      lo: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
      eth0: [{ family: "IPv6", internal: false, address: "fe80::1" }, { family: "IPv4", internal: false, address: "192.168.1.20" }],
    } as never;
    expect(lanAddress(nets)).toBe("192.168.1.20");
  });
});
