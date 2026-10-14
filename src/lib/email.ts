// Optional email through Resend (RESEND_API_KEY + EMAIL_FROM). Without them the
// app still works: staff copy sign-in and invite links and send them themselves.
export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!emailEnabled()) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text }),
  });
  if (!res.ok) console.error(`Email to ${to} failed: ${res.status} ${await res.text()}`);
  return res.ok;
}
