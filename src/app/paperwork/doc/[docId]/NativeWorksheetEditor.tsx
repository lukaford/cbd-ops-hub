"use client";

import { Fragment, useMemo, useState } from "react";
import { evaluateWorkbook, type Value } from "@/lib/forms/formula";
import { formatValue, isDateFormat } from "@/lib/forms/numFmt";
import { fromSerial, toSerial, type WorkbookModel } from "@/lib/forms/sheetModel";
import type { LayoutCell, LayoutRow, WorksheetLayout } from "@/lib/forms/native/worksheetBuild";
import { useAutosave } from "./useAutosave";

type Values = Record<string, Record<string, Value>>;
type Ref = { sheet: string; addr: string };

const HEADER_LABELS: Record<string, string> = { client: "Client name", room: "Location", designer: "Designer", date: "Date", job: "Job #" };

function show(v: Value, fmt: string | undefined): string {
  if (typeof v !== "number") return formatValue(v ?? null, fmt);
  if (fmt) return formatValue(v, fmt);
  if (v !== 0 && Math.abs(v) < 1) return `${Math.round(v * 1000) / 10}%`;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// A row's cells in groups: each thing to fill in, with the price and total after it.
function groups(row: LayoutRow): { lead: LayoutCell[]; items: { input: LayoutCell; after: LayoutCell[] }[] } {
  const lead: LayoutCell[] = [];
  const items: { input: LayoutCell; after: LayoutCell[] }[] = [];
  for (const c of row.cells) {
    if (c.kind === "out" || c.kind === "price") (items.length ? items[items.length - 1].after : lead).push(c);
    else items.push({ input: c, after: [] });
  }
  return { lead, items };
}

export default function NativeWorksheetEditor(props: {
  docId: number;
  title: string;
  name: string;
  revision: string;
  layout: WorksheetLayout;
  model: WorkbookModel;
  initial: Values;
  locked: boolean;
  pricesMissing: boolean;
  totals: { label: string; ref: Ref }[];
}) {
  const { layout, model, locked } = props;
  const [values, setValues] = useState<Values>(props.initial ?? {});
  const [title, setTitle] = useState(props.title);
  const [onlyFilled, setOnlyFilled] = useState(false);
  const [find, setFind] = useState("");
  const sheets = useMemo(() => [...new Set(layout.sections.map((s) => s.sheet))], [layout]);
  const [tab, setTab] = useState(sheets[0]);
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
  const cellOf = (r: Ref) => model.sheets.find((s) => s.name === r.sheet)?.cells[r.addr];
  const get = (r: Ref) => values[r.sheet]?.[r.addr];
  const put = (r: Ref, v: Value) =>
    setValues((cur) => {
      const sheet = { ...(cur[r.sheet] ?? {}) };
      if (v === null || v === "") delete sheet[r.addr];
      else sheet[r.addr] = v;
      return { ...cur, [r.sheet]: sheet };
    });

  const filledRow = (row: LayoutRow) => row.cells.some((c) => c.kind !== "out" && c.kind !== "price" && get(c) !== undefined);
  const needle = find.trim().toLowerCase();
  const visible = (row: LayoutRow) => (!onlyFilled || filledRow(row)) && (!needle || `${row.label} ${row.sub ?? ""} ${row.cells.map((c) => c.col ?? "").join(" ")}`.toLowerCase().includes(needle));

  // A plain function, not a component, so inputs keep focus while typing.
  function input(c: LayoutCell) {
    const v = get(c);
    if (c.kind === "check")
      return (
        <label className="nw-check">
          <input type="checkbox" checked={v !== undefined && v !== 0 && v !== ""} disabled={locked} onChange={(e) => put(c, e.target.checked ? 1 : null)} />
          {c.col && /purchased/i.test(c.col) ? "Purchased" : "Include"}
        </label>
      );
    if (c.kind === "text")
      return <input className="nw-text" placeholder="Description" value={v === undefined || v === null ? "" : String(v)} disabled={locked} onChange={(e) => put(c, e.target.value)} />;
    return (
      <input
        className="nw-qty"
        inputMode="decimal"
        aria-label={c.col ?? "Amount"}
        placeholder={typeof cellOf(c)?.v === "number" ? show(cellOf(c)!.v!, cellOf(c)!.fmt) : undefined}
        value={v === undefined || v === null ? "" : String(v)}
        disabled={locked}
        onChange={(e) => {
          const raw = e.target.value.replace(/[$,]/g, "");
          put(c, raw === "" ? null : !isNaN(Number(raw)) && !raw.endsWith(".") ? Number(raw) : raw);
        }}
      />
    );
  }

  const shown = (c: LayoutCell) => {
    const v = computed[c.sheet]?.[c.addr] ?? null;
    return show(v, cellOf(c)?.fmt);
  };

  return (
    <div className="nf">
      <div className="nf-top">
        <div>
          <h1>{props.name}</h1>
          <div className="muted">{props.revision}</div>
        </div>
        <label className="nf-field nf-room">
          <span className="nf-label">Room name on this packet</span>
          <input value={title} disabled={locked} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <span className={`pill ${save.kind === "error" ? "crit" : save.kind === "saving" ? "warn" : "ok"}`} role="status">
          {save.text}
        </span>
      </div>
      {props.pricesMissing && (
        <div className="banner">
          <p>Prices for this work sheet are not loaded yet, so totals show $0. An admin can load them on Paperwork → Prices.</p>
        </div>
      )}

      <section className="panel nf-section">
        <div className="nf-grid">
          {Object.entries(layout.header).map(([k, r]) => {
            if (!r) return null;
            const fmt = cellOf(r)?.fmt;
            const v = get(r);
            if (k === "date" || isDateFormat(fmt))
              return (
                <label key={k} className="nf-field">
                  <span className="nf-label">{HEADER_LABELS[k] ?? k}</span>
                  <input
                    type="date"
                    disabled={locked}
                    value={typeof v === "number" ? fromSerial(v).toISOString().slice(0, 10) : ""}
                    onChange={(e) => put(r, e.target.value ? toSerial(new Date(`${e.target.value}T12:00:00Z`)) : null)}
                  />
                </label>
              );
            return (
              <label key={k} className="nf-field">
                <span className="nf-label">{HEADER_LABELS[k] ?? k}</span>
                <input value={v === undefined || v === null ? "" : String(v)} disabled={locked} onChange={(e) => put(r, e.target.value)} />
              </label>
            );
          })}
        </div>
      </section>

      <div className="nw-totals" role="status">
        {props.totals.map((t) => (
          <span key={t.label}>
            {t.label}: <strong>{shown({ ...t.ref, kind: "out" })}</strong>
          </span>
        ))}
      </div>

      <div className="controls">
        <nav className="tabs" aria-label="Pages of the work sheet">
          {sheets.map((s) => (
            <button key={s} type="button" className="tab" aria-current={s === tab ? "page" : undefined} onClick={() => setTab(s)}>
              {s}
            </button>
          ))}
        </nav>
        <input type="search" placeholder="Find an item" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Find an item" />
        <label>
          <input type="checkbox" checked={onlyFilled} onChange={(e) => setOnlyFilled(e.target.checked)} /> Only lines filled in
        </label>
      </div>

      {layout.sections
        .filter((s) => s.sheet === tab)
        .map((s, i) => {
          const rows = s.rows.filter(visible);
          if (!rows.length) return null;
          return (
            <section key={`${s.title}-${i}`} className="panel nf-section">
              <h2>{s.title}</h2>
              <div className="nw-rows">
                {rows.map((row, j) => {
                  const g = groups(row);
                  return (
                    <div key={j} className={`nw-row${filledRow(row) ? " on" : ""}`}>
                      <div className="nw-label">
                        {row.label || (g.items[0]?.input.kind === "text" ? "Other item" : "")}
                        {row.sub && <span className="nf-hint">{row.sub}</span>}
                      </div>
                      <div className="nw-cells">
                        {g.lead.map((c) => (
                          <span key={c.addr} className="nw-out">
                            {c.col && <span className="nf-label">{c.col}</span>}
                            {shown(c)}
                          </span>
                        ))}
                        {g.items.map(({ input: cell, after }) => (
                          <span key={cell.addr} className={`nw-item${cell.kind === "text" ? " grow" : ""}`}>
                            {cell.col && cell.kind !== "check" && <span className="nf-label">{cell.col}</span>}
                            <span className="nw-line">
                              {input(cell)}
                              {after.map((c, k) => (
                                <Fragment key={c.addr}>
                                  <span className="muted">{c.kind === "price" && k === 0 ? "×" : "="}</span>
                                  <span className={c.kind === "price" ? "nw-price" : "nw-total"}>{shown(c)}</span>
                                </Fragment>
                              ))}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
    </div>
  );
}
