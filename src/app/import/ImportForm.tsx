"use client";

import Link from "next/link";
import { useActionState } from "react";
import { importPaste, type ImportState } from "./actions";

export function ImportForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importPaste, null);
  return (
    <form className="pastebox" action={action}>
      <label className="label" htmlFor="paste">
        In Manager, open Special Orders, select the whole table, copy it, then paste here
      </label>
      <textarea id="paste" name="paste" placeholder="Click here and press Ctrl+V (Cmd+V on a Mac)" required />
      <div className="row">
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "Loading…" : "Update the board"}
        </button>
        <span className="msg">Each paste replaces the previous one, so paste the whole table every time.</span>
      </div>
      {state && (
        <div className={`notice${state.ok ? "" : " err"}`} role="status">
          {state.message} {state.ok && <Link href="/folders">Open the folders board</Link>}
        </div>
      )}
    </form>
  );
}
