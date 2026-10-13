"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [error, action, pending] = useActionState(signIn, null);
  return (
    <form className="pastebox" action={action} style={{ maxWidth: 360 }}>
      <input type="hidden" name="next" value={next} />
      <label className="label" htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
      <div className="row">
        <button className="btn primary" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      </div>
      {error && <div className="notice err" role="alert">{error}</div>}
    </form>
  );
}
