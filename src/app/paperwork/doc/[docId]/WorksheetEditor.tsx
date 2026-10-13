"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { evaluateWorkbook, numToCol, type Value } from "@/lib/forms/formula";
import { coerceInput, formatValue, isDateFormat } from "@/lib/forms/numFmt";
import type { CellStyle, WorkbookModel } from "@/lib/forms/sheetModel";
import { useAutosave } from "./useAutosave";

type Values = Record<string, Record<string, Value>>;

function cellCss(st: CellStyle | undefined): CSSProperties {
  if (!st) return {};
  const b = (w?: number) => (w ? `${w === 1 ? 1 : w === 2 ? 2 : 3}px solid #222` : undefined);
  return {
    fontWeight: st.b ? 700 : undefined,
    fontStyle: st.i ? "italic" : undefined,
    fontSize: st.sz ? `${(st.sz * 4) / 3}px` : undefined,
    color: st.c,
    background: st.bg,
    textAlign: st.h,
    verticalAlign: st.v === "top" ? "top" : st.v === "middle" ? "middle" : "bottom",
    whiteSpace: st.wrap ? "normal" : "nowrap",
    borderTop: b(st.bt),
    borderRight: b(st.br),
    borderBottom: b(st.bb),
    borderLeft: b(st.bl),
  };
}

export default function WorksheetEditor(props: { docId: number; title: string; model: WorkbookModel; initial: Values; locked: boolean }) {
  const { model, locked } = props;
  const [values, setValues] = useState<Values>(props.initial);
  const [title, setTitle] = useState(props.title);
  const [tab, setTab] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [editing, setEditing] = useState<{ key: string; raw: string } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const save = useAutosave(props.docId, values, title, locked);

  const sources = useMemo(() => {
    const out: Record<string, Record<string, { formula?: string; value?: Value }>> = {};
    for (const s of model.sheets) {
      const c: Record<string, { formula?: string; value?: Value }> = (out[s.name] = {});
      for (const [a, cell] of Object.entries(s.cells)) c[a] = { formula: cell.f, value: cell.v };
    }
    return out;
  }, [model]);
  const computed = useMemo(() => evaluateWorkbook(sources, values), [sources, values]);

  const sheet = model.sheets[tab];
  const width = sheet.colWidths.reduce((a, b) => a + b, 0);

  // Start zoomed to fit the screen width.
  useEffect(() => {
    const w = wrap.current?.clientWidth;
    if (w) setZoom(Math.min(1, Math.max(0.35, Math.floor((w / width) * 20) / 20)));
  }, [width]);

  const covered = useMemo(() => new Set(sheet.covered), [sheet]);
  const styles = useMemo(() => model.styles.map(cellCss), [model]);

  const setCell = (addr: string, raw: string, fmt?: string) => {
    setEditing({ key: `${sheet.name}!${addr}`, raw });
    setValues((v) => ({ ...v, [sheet.name]: { ...v[sheet.name], [addr]: coerceInput(raw, fmt) } }));
  };

  const rows = [];
  for (let r = sheet.area.r1; r <= sheet.area.r2; r++) {
    const tds = [];
    for (let c = sheet.area.c1; c <= sheet.area.c2; c++) {
      const addr = `${numToCol(c)}${r}`;
      if (covered.has(addr)) continue;
      const cell = sheet.cells[addr];
      const css = cell?.st !== undefined ? styles[cell.st] : undefined;
      const shown = computed[sheet.name]?.[addr] ?? cell?.v ?? null;
      let inner: React.ReactNode = formatValue(shown, cell?.fmt);
      if (cell?.input) {
        const key = `${sheet.name}!${addr}`;
        const typed = values[sheet.name]?.[addr];
        const display = editing?.key === key ? editing.raw : typed === undefined || typed === null ? (typeof cell.v === "string" ? cell.v : formatValue(cell.v ?? null, cell.fmt)) : formatValue(typed, cell.fmt);
        const numeric = typeof cell.v === "number" || (!!cell.fmt && /[0#]/.test(cell.fmt) && !isDateFormat(cell.fmt));
        inner = (
          <input
            className="cellin"
            value={display}
            disabled={locked}
            inputMode={numeric ? "decimal" : "text"}
            placeholder={isDateFormat(cell.fmt) ? "m/d/yy" : undefined}
            aria-label={`${sheet.name} ${addr}`}
            onChange={(e) => setCell(addr, e.target.value, cell.fmt)}
            onBlur={() => setEditing(null)}
            style={{ textAlign: css?.textAlign, fontWeight: css?.fontWeight, color: css?.color ?? "#0070C0" }}
          />
        );
      }
      tds.push(
        <td key={addr} rowSpan={cell?.rs} colSpan={cell?.cs} style={css} className={cell?.input ? "in" : undefined}>
          {inner}
        </td>,
      );
    }
    rows.push(
      <tr key={r} style={{ height: sheet.rowHeights[r - sheet.area.r1] }}>
        {tds}
      </tr>,
    );
  }

  return (
    <div className="editor">
      <div className="editbar">
        <input className="title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={locked} aria-label="Room name" />
        <nav className="tabs" aria-label="Sheet tabs">
          {model.sheets.map((s, i) => (
            <button key={s.name} className={`tab${i === tab ? " on" : ""}`} onClick={() => setTab(i)} type="button">
              {s.name}
            </button>
          ))}
        </nav>
        <span className="zoom">
          <button type="button" className="btn" onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(2)))} aria-label="Zoom out">
            −
          </button>
          {Math.round(zoom * 100)}%
          <button type="button" className="btn" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))} aria-label="Zoom in">
            +
          </button>
        </span>
        <span className={`save ${save.kind}`} role="status">
          {save.text}
        </span>
      </div>
      <div className="sheetwrap" ref={wrap}>
        <table className="sheet" style={{ width, zoom }}>
          <colgroup>
            {sheet.colWidths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <tbody>{rows}</tbody>
        </table>
      </div>
    </div>
  );
}

