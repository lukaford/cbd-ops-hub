"use client";

import { useEffect, useRef, useState } from "react";
import type { LabeledField } from "@/lib/forms/fieldLabels";
import type { FieldValues } from "@/lib/forms/pdfForm";
import type { DetailModel } from "@/lib/forms/review";
import { useAutosave } from "./useAutosave";

// Draws the blank detail sheet and lays the real fields over it, so designers
// fill in exactly the sheet they know. A list view helps on small phones.
export default function DetailEditor(props: { docId: number; templateId: number; title: string; model: DetailModel; initial: FieldValues; locked: boolean }) {
  const { model, locked } = props;
  const [values, setValues] = useState<FieldValues>(props.initial);
  const [title, setTitle] = useState(props.title);
  const [mode, setMode] = useState<"sheet" | "list">("sheet");
  const [zoom, setZoom] = useState(1);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [renderError, setRenderError] = useState("");
  const [width, setWidth] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const save = useAutosave(props.docId, values, title, locked);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf-worker";
        const data = await (await fetch(`/paperwork/templates/${props.templateId}/file`)).arrayBuffer();
        const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
        const urls: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: 2.5 });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width;
          canvas.height = vp.height;
          // Draw the printed sheet only; the fields are drawn by the app on top.
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp, annotationMode: pdfjs.AnnotationMode.DISABLE }).promise;
          urls.push(canvas.toDataURL("image/png"));
        }
        if (!cancelled) setPageImages(urls);
      } catch (err) {
        if (!cancelled) setRenderError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.templateId]);

  const set = (name: string, v: string | boolean) => setValues((cur) => ({ ...cur, [name]: v }));
  const value = (f: LabeledField) => (values[f.name] !== undefined ? values[f.name] : (f.value ?? (f.kind === "check" ? false : "")));

  const control = (f: LabeledField, boxIndex: number, style?: React.CSSProperties) => {
    const v = value(f);
    const label = [f.group, f.label].filter(Boolean).join(" / ") || f.name;
    if (f.kind === "check")
      return <input key={f.name + boxIndex} type="checkbox" className="pdfcheck" style={style} checked={v === true} disabled={locked} aria-label={label} onChange={(e) => set(f.name, e.target.checked)} />;
    if (f.kind === "radio") {
      const on = f.boxes[boxIndex]?.on ?? String(boxIndex);
      return <input key={f.name + boxIndex} type="radio" className="pdfcheck" style={style} name={f.name} checked={v === on} disabled={locked} aria-label={`${label} ${on}`} onChange={() => set(f.name, on)} />;
    }
    if (f.kind === "choice") {
      const opts = f.options ?? [];
      const s = String(v ?? "");
      return (
        <select key={f.name + boxIndex} className="pdfin" style={style} value={s} disabled={locked} aria-label={label} onChange={(e) => set(f.name, e.target.value)}>
          {!opts.includes(s) && <option value={s}>{s}</option>}
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }
    if (f.multiline)
      return <textarea key={f.name + boxIndex} className="pdfin" style={style} value={String(v ?? "")} disabled={locked} aria-label={label} onChange={(e) => set(f.name, e.target.value)} />;
    return (
      <input
        key={f.name + boxIndex}
        className="pdfin"
        style={style}
        value={String(v ?? "")}
        maxLength={f.maxLen}
        disabled={locked}
        aria-label={label}
        onChange={(e) => set(f.name, e.target.value)}
      />
    );
  };

  const pageW = width * zoom;

  return (
    <div className="editor">
      <div className="editbar">
        <input className="title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={locked} aria-label="Room name" />
        <nav className="tabs" aria-label="View">
          <button type="button" className={`tab${mode === "sheet" ? " on" : ""}`} onClick={() => setMode("sheet")}>
            Sheet
          </button>
          <button type="button" className={`tab${mode === "list" ? " on" : ""}`} onClick={() => setMode("list")}>
            List
          </button>
        </nav>
        {mode === "sheet" && (
          <span className="zoom">
            <button type="button" className="btn" onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))} aria-label="Zoom out">
              −
            </button>
            {Math.round(zoom * 100)}%
            <button type="button" className="btn" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} aria-label="Zoom in">
              +
            </button>
          </span>
        )}
        <span className={`save ${save.kind}`} role="status">
          {save.text}
        </span>
      </div>

      <div className="sheetwrap" ref={wrap}>
        {mode === "sheet" &&
          model.pages.map((pg, pi) => {
            const k = pageW / pg.w;
            return (
              <div key={pi} className="pdfpage" style={{ width: pageW, height: pg.h * k }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {pageImages[pi] ? <img src={pageImages[pi]} alt="" draggable={false} /> : <div className="muted pad">{renderError ? `Could not draw the sheet (${renderError}). Use List view.` : "Loading sheet…"}</div>}
                {model.fields.flatMap((f) =>
                  f.boxes.map((b, bi) =>
                    b.page !== pi
                      ? null
                      : control(f, bi, {
                          left: b.x * k,
                          top: (pg.h - b.y - b.h) * k,
                          width: b.w * k,
                          height: b.h * k,
                          fontSize: Math.max(6, Math.min(b.h * 0.72, f.fontSize || 10) * k),
                          textAlign: f.align,
                        }),
                  ),
                )}
              </div>
            );
          })}
        {mode === "list" && (
          <div className="fieldlist">
            {[...model.fields]
              .sort((a, b) => b.boxes[0].y - a.boxes[0].y || a.boxes[0].x - b.boxes[0].x)
              .map((f) => (
                <label key={f.name} className={f.kind === "check" ? "chk" : undefined}>
                  <span>{[f.group, f.label].filter(Boolean).join(" / ") || f.name}</span>
                  {f.kind === "radio" ? f.boxes.map((_, bi) => control(f, bi)) : control(f, 0)}
                </label>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
