// Shared-password sign-in for a hosted copy. With APP_PASSWORD unset (running
// on your own computer) every page is open. Uses Web Crypto so it also runs in middleware.
export const SESSION_COOKIE = "hub_session";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

function secret(): string | undefined {
  return process.env.SESSION_SECRET || process.env.APP_PASSWORD || undefined;
}

export function signInRequired(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

async function sign(payload: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(payload)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSession(now = Date.now()): Promise<string> {
  const exp = String(now + SESSION_DAYS * 864e5);
  return `${exp}.${await sign(exp, secret()!)}`;
}

export async function validSession(token: string | undefined, now = Date.now()): Promise<boolean> {
  const key = secret();
  if (!key || !token) return false;
  const [exp, mac] = token.split(".");
  if (!exp || !mac || Number(exp) < now) return false;
  return sameText(mac, await sign(exp, key));
}

export async function passwordMatches(given: string): Promise<boolean> {
  const want = process.env.APP_PASSWORD;
  if (!want) return false;
  // Compare HMACs so the comparison takes the same time whatever the input length.
  return sameText(await sign(given, "pw"), await sign(want, "pw"));
}
