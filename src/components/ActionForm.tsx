"use client";

import { useActionState } from "react";

export type ActionResult = { error?: string; message?: string; link?: string } | null;

// A form whose server action answers with an error, a note, or a one-time link to copy.
export function ActionForm({
  action,
  children,
  submit,
  className = "pastebox",
}: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  children?: React.ReactNode;
  submit: string;
  className?: string;
}) {
  const [result, run, pending] = useActionState(action, null);
  return (
    <form className={className} action={run}>
      {children}
      <div className="row">
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "Working…" : submit}
        </button>
      </div>
      {result?.error && <div className="notice err" role="alert">{result.error}</div>}
      {result?.message && <div className="notice" role="status">{result.message}</div>}
      {result?.link && (
        <div className="linkbox">
          <input readOnly value={result.link} onFocus={(e) => e.currentTarget.select()} aria-label="One-time link" />
          <button className="btn" type="button" onClick={() => navigator.clipboard?.writeText(result.link!)}>
            Copy
          </button>
        </div>
      )}
    </form>
  );
}
