"use client";

import { useEffect, useMemo, useState } from "react";
import { FIELD_TYPES, hasOptions, type DetailFormDef, type FieldType, type FormField, type FormSection } from "@/lib/forms/native/types";
import { saveFormDef } from "../actions";

type List = { key: string; name: string; options: string[] };

const newKey = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

function move<T>(arr: T[], i: number, by: number): T[] {
  const j = i + by;
  if (j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export default function FormEditor({ initial, lists }: { initial: DetailFormDef; lists: List[] }) {
  const [def, setDef] = useState<DetailFormDef>(initial);
  const [saved, setSaved] = useState<DetailFormDef>(initial);
  const [status, setStatus] = useState<{ kind: "ok" | "error" | "saving"; text: string } | null>(null);
  const [find, setFind] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const dirty = useMemo(() => JSON.stringify(def) !== JSON.stringify(saved), [def, saved]);
  const listByKey = useMemo(() => new Map(lists.map((l) => [l.key, l])), [lists]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setSections = (fn: (s: FormSection[]) => FormSection[]) => setDef((d) => ({ ...d, sections: fn(d.sections) }));
  const setSection = (si: number, patch: Partial<FormSection>) => setSections((ss) => ss.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  const setFields = (si: number, fn: (f: FormField[]) => FormField[]) => setSections((ss) => ss.map((s, i) => (i === si ? { ...s, fields: fn(s.fields) } : s)));
  const setField = (si: number, fi: number, patch: Partial<FormField>) =>
    setFields(si, (fs) =>
      fs.map((f, i) => {
        if (i !== fi) return f;
        const next = { ...f, ...patch };
        for (const k of Object.keys(patch) as (keyof FormField)[]) if (patch[k] === undefined) delete next[k];
        return next;
      }),
    );

  function changeType(si: number, fi: number, f: FormField, type: FieldType) {
    if (hasOptions(type) && !hasOptions(f.type)) setField(si, fi, { type, options: f.options ?? [], list: f.list });
    else if (!hasOptions(type)) setField(si, fi, { type, options: undefined, list: undefined });
    else setField(si, fi, { type });
  }

  async function save() {
    setStatus({ kind: "saving", text: "Saving…" });
    const r = await saveFormDef(def.key, def);
    if (r.ok) {
      setSaved(def);
      setStatus({ kind: "ok", text: `Saved ${new Date(r.savedAt!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}. Designers get it on new and unfinished paperwork.` });
    } else setStatus({ kind: "error", text: r.error ?? "Could not save." });
  }

  const needle = find.trim().toLowerCase();
  const matches = (f: FormField) => !needle || `${f.label} ${f.hint ?? ""} ${(f.list ? listByKey.get(f.list)?.name : "") ?? ""}`.toLowerCase().includes(needle);

  return (
    <div className="fe">
      <div className="fe-bar">
        <div className="fe-title">
          <label className="nf-field">
            <span className="nf-label">Form name</span>
            <input value={def.name} onChange={(e) => setDef({ ...def, name: e.target.value })} />
          </label>
          <label className="nf-field">
            <span className="nf-label">Revision</span>
            <input value={def.revision} onChange={(e) => setDef({ ...def, revision: e.target.value })} />
          </label>
        </div>
        <div className="fe-save">
          {status && (
            <span className={`pill ${status.kind === "error" ? "crit" : status.kind === "saving" ? "warn" : "ok"}`} role="status">
              {status.text}
            </span>
          )}
          {dirty && <span className="pill warn">Not saved</span>}
          <button type="button" className="btn" disabled={!dirty} onClick={() => setDef(saved)}>
            Undo changes
          </button>
          <button type="button" className="btn primary" disabled={!dirty || status?.kind === "saving"} onClick={save}>
            Save form
          </button>
        </div>
      </div>

      <div className="controls">
        <input type="search" placeholder="Find a question" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Find a question" />
        <button type="button" className="btn" onClick={() => setOpen(Object.fromEntries(def.sections.map((s) => [s.key, true])))}>
          Open all
        </button>
        <button type="button" className="btn" onClick={() => setOpen({})}>
          Close all
        </button>
      </div>

      {def.sections.map((s, si) => {
        const shown = s.fields.map((f, fi) => ({ f, fi })).filter(({ f }) => matches(f));
        if (needle && !shown.length) return null;
        const isOpen = Boolean(needle) || open[s.key];
        return (
          <section key={s.key} className="panel fe-section">
            <div className="fe-head">
              <button type="button" className="link fe-toggle" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))}>
                {isOpen ? "▾" : "▸"}
              </button>
              <input className="fe-section-title" aria-label="Section title" value={s.title} onChange={(e) => setSection(si, { title: e.target.value })} />
              <span className="muted">{s.fields.filter((f) => !f.hidden).length} questions</span>
              <span className="fe-tools">
                <button type="button" className="btn" aria-label="Move section up" disabled={si === 0} onClick={() => setSections((ss) => move(ss, si, -1))}>
                  ↑
                </button>
                <button type="button" className="btn" aria-label="Move section down" disabled={si === def.sections.length - 1} onClick={() => setSections((ss) => move(ss, si, 1))}>
                  ↓
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    if (!s.fields.length || confirm(`Delete the section "${s.title}" and its ${s.fields.length} questions? Turning questions off keeps them for later.`))
                      setSections((ss) => ss.filter((_, i) => i !== si));
                  }}
                >
                  Delete
                </button>
              </span>
            </div>
            {isOpen && (
              <>
                <label className="nf-field">
                  <span className="nf-label">Note shown under the section title</span>
                  <input value={s.note ?? ""} onChange={(e) => setSection(si, { note: e.target.value || undefined })} />
                </label>
                <ol className="fe-fields">
                  {shown.map(({ f, fi }) => {
                    const list = f.list ? listByKey.get(f.list) : undefined;
                    return (
                      <li key={f.key} className={`fe-field${f.hidden ? " off" : ""}`}>
                        <div className="fe-row">
                          <label className="nf-field fe-label">
                            <span className="nf-label">Question</span>
                            <input value={f.label} onChange={(e) => setField(si, fi, { label: e.target.value })} />
                          </label>
                          <label className="nf-field">
                            <span className="nf-label">Answer type</span>
                            <select value={f.type} onChange={(e) => changeType(si, fi, f, e.target.value as FieldType)}>
                              {FIELD_TYPES.map((t) => (
                                <option key={t.type} value={t.type}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <span className="fe-tools">
                            <button type="button" className="btn" aria-label="Move up" disabled={fi === 0} onClick={() => setFields(si, (fs) => move(fs, fi, -1))}>
                              ↑
                            </button>
                            <button type="button" className="btn" aria-label="Move down" disabled={fi === s.fields.length - 1} onClick={() => setFields(si, (fs) => move(fs, fi, 1))}>
                              ↓
                            </button>
                            <select
                              aria-label="Move to another section"
                              value=""
                              onChange={(e) => {
                                const to = Number(e.target.value);
                                setSections((ss) => ss.map((x, i) => (i === si ? { ...x, fields: x.fields.filter((_, j) => j !== fi) } : i === to ? { ...x, fields: [...x.fields, f] } : x)));
                              }}
                            >
                              <option value="">Move to…</option>
                              {def.sections.map((x, i) =>
                                i === si ? null : (
                                  <option key={x.key} value={i}>
                                    {x.title}
                                  </option>
                                ),
                              )}
                            </select>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => {
                                if (confirm(`Delete "${f.label}"? Answers already given on unfinished paperwork are dropped. Turning it off instead keeps it for later.`))
                                  setFields(si, (fs) => fs.filter((_, j) => j !== fi));
                              }}
                            >
                              Delete
                            </button>
                          </span>
                        </div>
                        <div className="fe-row">
                          <label className="nf-check">
                            <input type="checkbox" checked={Boolean(f.required)} onChange={(e) => setField(si, fi, { required: e.target.checked || undefined })} />
                            <span>Required</span>
                          </label>
                          <label className="nf-check">
                            <input type="checkbox" checked={Boolean(f.hidden)} onChange={(e) => setField(si, fi, { hidden: e.target.checked || undefined })} />
                            <span>Turned off</span>
                          </label>
                          <label className="nf-check">
                            <input type="checkbox" checked={Boolean(f.wide)} onChange={(e) => setField(si, fi, { wide: e.target.checked || undefined })} />
                            <span>Full width</span>
                          </label>
                          <label className="nf-field fe-hint">
                            <span className="nf-label">Help text</span>
                            <input value={f.hint ?? ""} onChange={(e) => setField(si, fi, { hint: e.target.value || undefined })} />
                          </label>
                        </div>
                        {hasOptions(f.type) && (
                          <div className="fe-options">
                            <label className="nf-field">
                              <span className="nf-label">Choices</span>
                              <select
                                value={f.list ?? ""}
                                onChange={(e) => {
                                  const key = e.target.value;
                                  if (key) setField(si, fi, { list: key, options: undefined });
                                  else setField(si, fi, { list: undefined, options: [...(list?.options ?? f.options ?? [])] });
                                }}
                              >
                                <option value="">Only for this question (type them below)</option>
                                <optgroup label="Shared dropdown list">
                                  {lists.map((l) => (
                                    <option key={l.key} value={l.key}>
                                      {l.name} ({l.options.length})
                                    </option>
                                  ))}
                                </optgroup>
                              </select>
                            </label>
                            {list ? (
                              <p className="muted fe-preview">
                                {list.options.slice(0, 8).join(" · ")}
                                {list.options.length > 8 && ` · and ${list.options.length - 8} more`}{" "}
                                <a href={`/paperwork/forms/lists?list=${encodeURIComponent(list.key)}`} target="_blank" rel="noreferrer">
                                  Edit this list
                                </a>{" "}
                                (changes every question that uses it)
                              </p>
                            ) : (
                              <label className="nf-field">
                                <span className="nf-label">One choice per line</span>
                                <textarea rows={Math.min(12, Math.max(3, (f.options?.length ?? 0) + 1))} value={(f.options ?? []).join("\n")} onChange={(e) => setField(si, fi, { options: e.target.value.split("\n") })} />
                              </label>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
                {!needle && (
                  <button type="button" className="btn" onClick={() => setFields(si, (fs) => [...fs, { key: newKey("q"), label: "New question", type: "select", options: [] }])}>
                    + Add a question
                  </button>
                )}
              </>
            )}
          </section>
        );
      })}

      {!needle && (
        <p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const key = newKey("s");
              setSections((ss) => [...ss, { key, title: "New section", fields: [] }]);
              setOpen((o) => ({ ...o, [key]: true }));
            }}
          >
            + Add a section
          </button>
        </p>
      )}
    </div>
  );
}
