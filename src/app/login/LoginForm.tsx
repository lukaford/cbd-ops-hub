"use client";

import { useActionState } from "react";

type Field = { name: string; label: string; type: string; autoComplete?: string };

// One form for every sign-in style page: sign in, first-run setup, accepting an invite.
export function LoginForm({
  action,
  fields,
  hidden = {},
  submit = "Sign in",
}: {
  action: (prev: string | null, form: FormData) => Promise<string | null>;
  fields: Field[];
  hidden?: Record<string, string>;
  submit?: string;
}) {
  const [error, run, pending] = useActionState(action, null);
  return (
    <form className="pastebox" action={run} style={{ maxWidth: 380 }}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {fields.map((f, i) => (
        <div key={f.name} style={{ display: "grid", gap: 4 }}>
          <label className="label" htmlFor={f.name}>{f.label}</label>
          <input id={f.name} name={f.name} type={f.type} autoComplete={f.autoComplete} required autoFocus={i === 0} />
        </div>
      ))}
      <div className="row">
        <button className="btn primary" type="submit" disabled={pending}>{pending ? "Working…" : submit}</button>
      </div>
      {error && <div className="notice err" role="alert">{error}</div>}
    </form>
  );
}
