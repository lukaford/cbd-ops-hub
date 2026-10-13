"use client";

import { useEffect, useRef, useState } from "react";
import { saveDocValues } from "../../actions";

export type SaveState = { kind: "idle" | "saving" | "saved" | "error"; text: string };

// Saves the sheet a moment after the designer stops typing, and before the page closes.
export function useAutosave(docId: number, values: unknown, title: string, locked: boolean): SaveState {
  const [state, setState] = useState<SaveState>({ kind: "idle", text: locked ? "Submitted: read only" : "All changes saved" });
  const first = useRef(true);
  const pending = useRef<{ values: unknown; title: string } | null>(null);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (locked) return;
    pending.current = { values, title };
    setState({ kind: "saving", text: "Saving…" });
    const t = setTimeout(async () => {
      const job = pending.current;
      if (!job) return;
      try {
        const r = await saveDocValues(docId, job.values, job.title);
        if (pending.current === job) pending.current = null;
        setState(r.ok ? { kind: "saved", text: `Saved ${new Date(r.savedAt!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` } : { kind: "error", text: r.error ?? "Not saved" });
      } catch {
        setState({ kind: "error", text: "Not saved: check the connection. Your changes are still on this screen." });
      }
    }, 700);
    return () => clearTimeout(t);
  }, [docId, values, title, locked]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  return state;
}
