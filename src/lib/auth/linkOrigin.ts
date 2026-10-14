import os from "node:os";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

// This computer's address on the shop network, if it has one.
export function lanAddress(nets: ReturnType<typeof os.networkInterfaces> = os.networkInterfaces()): string | null {
  for (const list of Object.values(nets)) {
    for (const n of list ?? []) if (n.family === "IPv4" && !n.internal) return n.address;
  }
  return null;
}

// The web address to put in invite and sign-in links. When the app runs on one
// computer and is opened there as http://localhost:3000, a link with "localhost"
// in it opens nothing on anyone else's computer or phone, so it uses this
// computer's network address instead. APP_URL, when set, always wins.
export function linkOrigin(requestOrigin: string, appUrl = process.env.APP_URL, lan: string | null = lanAddress()): string {
  if (appUrl) return appUrl.replace(/\/+$/, "");
  const url = new URL(requestOrigin);
  if (LOOPBACK.has(url.hostname) && lan) url.hostname = lan;
  return url.origin;
}
