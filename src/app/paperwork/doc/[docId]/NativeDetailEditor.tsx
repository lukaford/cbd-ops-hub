"use client";

import { useState } from "react";
import type { Answer, Answers, DetailFormDef, FormField } from "@/lib/forms/native/types";
import { isBlank } from "@/lib/forms/native/types";
import { useAutosave } from "./useAutosave";

function Field({ f: field, value, set, locked }: { f: FormField; value: Answer | undefined; set: (v: Answer | undefined) => void; locked: boolean }) {
  const id = `f-${field.key}`;
  // Required questions are marked; the paperwork checks list any left blank.
  const f = field.required ? { ...field, label: `${field.label} *` } : field;
  const hint = f.hint ? <span className="nf-hint">{f.hint}</span> : null;
  switch (f.type) {
    case "check":
      return (
        <label className="nf-check">
          <input type="checkbox" checked={value === true} disabled={locked} onChange={(e) => set(e.target.checked || undefined)} />
          <span>{f.label}</span>
          {hint}
        </label>
      );
    case "choice":
      return (
        <div className="nf-field" role="group" aria-labelledby={id}>
          <span id={id} className="nf-label">
            {f.label}
          </span>
          <div className="nf-choices">
            {f.options!.map((o) => (
              <button key={o} type="button" className={`nf-choice${value === o ? " on" : ""}`} aria-pressed={value === o} disabled={locked} onClick={() => set(value === o ? undefined : o)}>
                {o}
              </button>
            ))}
          </div>
          {hint}
        </div>
      );
    case "checks": {
      const picked = Array.isArray(value) ? value : [];
      return (
        <div className="nf-field" role="group" aria-labelledby={id}>
          <span id={id} className="nf-label">
            {f.label}
          </span>
          <div className="nf-choices">
            {f.options!.map((o) => (
              <label key={o} className={`nf-choice${picked.includes(o) ? " on" : ""}`}>
                <input
                  type="checkbox"
                  checked={picked.includes(o)}
                  disabled={locked}
                  onChange={(e) => {
                    const next = e.target.checked ? [...picked, o] : picked.filter((x) => x !== o);
                    set(next.length ? f.options!.filter((x) => next.includes(x)) : undefined);
                  }}
                />
                {o}
              </label>
            ))}
          </div>
          {hint}
        </div>
      );
    }
    case "select":
      return (
        <label className="nf-field" htmlFor={id}>
          <span className="nf-label">{f.label}</span>
          <select id={id} value={typeof value === "string" ? value : ""} disabled={locked} onChange={(e) => set(e.target.value || undefined)}>
            <option value="">—</option>
            {f.options!.map((o) => (
              <option key={o}>{o}</option>
            ))}
            {typeof value === "string" && value && !f.options!.includes(value) && <option value={value}>{value} (no longer offered: pick again)</option>}
          </select>
          {hint}
        </label>
      );
    case "textarea":
      return (
        <label className="nf-field" htmlFor={id}>
          <span className="nf-label">{f.label}</span>
          <textarea id={id} rows={5} value={typeof value === "string" ? value : ""} disabled={locked} onChange={(e) => set(e.target.value || undefined)} />
          {hint}
        </label>
      );
    default:
      return (
        <label className={`nf-field${f.type === "number" ? " nf-num" : ""}`} htmlFor={id}>
          <span className="nf-label">{f.label}</span>
          <input
            id={id}
            type={f.type === "date" ? "date" : "text"}
            inputMode={f.type === "number" ? "decimal" : undefined}
            value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
            disabled={locked}
            onChange={(e) => set(e.target.value || undefined)}
          />
          {hint}
        </label>
      );
  }
}

export default function NativeDetailEditor(props: { docId: number; title: string; def: DetailFormDef; initial: Answers; locked: boolean }) {
  const { def, locked } = props;
  const [values, setValues] = useState<Answers>(props.initial ?? {});
  const [title, setTitle] = useState(props.title);
  const save = useAutosave(props.docId, values, title, locked);
  const set = (key: string) => (v: Answer | undefined) =>
    setValues((cur) => {
      const next = { ...cur };
      if (v === undefined) delete next[key];
      else next[key] = v;
      return next;
    });
  const filled = (keys: string[]) => keys.filter((k) => !isBlank(values[k])).length;

  return (
    <div className="nf">
      <div className="nf-top">
        <div>
          <h1>{def.name}</h1>
          <div className="muted">{def.revision}</div>
        </div>
        <label className="nf-field nf-room">
          <span className="nf-label">Room name on this packet</span>
          <input value={title} disabled={locked} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <span className={`pill ${save.kind === "error" ? "crit" : save.kind === "saving" ? "warn" : "ok"}`} role="status">
          {save.text}
        </span>
      </div>
      {def.note && <p className="nf-note">{def.note}</p>}
      {def.sections.some((s) => s.fields.some((f) => f.required)) && <p className="nf-note">* Required before the paperwork is complete.</p>}
      <nav className="nf-index" aria-label="Sections">
        {def.sections.map((s) => {
          const n = filled(s.fields.map((f) => f.key));
          return (
            <a key={s.key} href={`#s-${s.key}`}>
              {s.title}
              {n > 0 && <span className="n">{n}</span>}
            </a>
          );
        })}
      </nav>
      {def.sections.map((s) => (
        <fieldset key={s.key} id={`s-${s.key}`} className="panel nf-section">
          <legend>{s.title}</legend>
          {s.note && <p className="nf-note">{s.note}</p>}
          {s.fields.length > 0 && (
            <div className="nf-grid">
              {s.fields.map((f) => (
                <div key={f.key} className={f.wide || f.type === "textarea" || f.type === "checks" || (f.type === "choice" && (f.options?.length ?? 0) > 3) ? "wide" : ""}>
                  <Field f={f} value={values[f.key]} set={set(f.key)} locked={locked} />
                </div>
              ))}
            </div>
          )}
        </fieldset>
      ))}
    </div>
  );
}
