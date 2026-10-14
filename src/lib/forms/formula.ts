// A small evaluator for the work sheet formulas. The CBD work sheets only use
// SUM, cell and range references (also across sheets) and + - * /, so this
// covers them without pulling in a spreadsheet engine.

export type Value = number | string | null;

type Node =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "ref"; sheet?: string; addr: string }
  | { t: "range"; sheet?: string; from: string; to: string }
  | { t: "call"; name: string; args: Node[] }
  | { t: "neg"; x: Node }
  | { t: "bin"; op: string; a: Node; b: Node };

export function colToNum(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function numToCol(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function splitAddr(addr: string): { col: number; row: number } {
  const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(addr.toUpperCase());
  if (!m) throw new Error(`Bad cell address ${addr}`);
  return { col: colToNum(m[1]), row: Number(m[2]) };
}

export function cleanAddr(addr: string): string {
  const { col, row } = splitAddr(addr);
  return `${numToCol(col)}${row}`;
}

export function rangeAddrs(from: string, to: string): string[] {
  const a = splitAddr(from);
  const b = splitAddr(to);
  const out: string[] = [];
  for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++)
    for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) out.push(`${numToCol(c)}${r}`);
  return out;
}

export function parseFormula(src: string): Node {
  const s = src.startsWith("=") ? src.slice(1) : src;
  let i = 0;
  const ws = () => {
    while (s[i] === " ") i++;
  };
  const peek = () => (ws(), s[i]);

  function sheetName(): string | undefined {
    ws();
    if (s[i] === "'") {
      const end = s.indexOf("'!", i + 1);
      if (end < 0) throw new Error(`Bad sheet reference in ${src}`);
      const name = s.slice(i + 1, end).replace(/''/g, "'");
      i = end + 2;
      return name;
    }
    const m = /^([A-Za-z_][\w.]*)!/.exec(s.slice(i));
    if (m) {
      i += m[0].length;
      return m[1];
    }
    return undefined;
  }

  function primary(): Node {
    const ch = peek();
    if (ch === "(") {
      i++;
      const x = expr();
      if (peek() !== ")") throw new Error(`Missing ) in ${src}`);
      i++;
      return x;
    }
    if (ch === "-") {
      i++;
      return { t: "neg", x: primary() };
    }
    if (ch === "+") {
      i++;
      return primary();
    }
    if (ch === '"') {
      const end = s.indexOf('"', i + 1);
      const v = s.slice(i + 1, end);
      i = end + 1;
      return { t: "str", v };
    }
    const num = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (num) {
      i += num[0].length;
      return { t: "num", v: Number(num[0]) };
    }
    const sheet = sheetName();
    const ref = /^\$?[A-Za-z]+\$?\d+/.exec(s.slice(i));
    if (ref) {
      i += ref[0].length;
      if (s[i] === ":") {
        i++;
        const to = /^\$?[A-Za-z]+\$?\d+/.exec(s.slice(i));
        if (!to) throw new Error(`Bad range in ${src}`);
        i += to[0].length;
        return { t: "range", sheet, from: cleanAddr(ref[0]), to: cleanAddr(to[0]) };
      }
      return { t: "ref", sheet, addr: cleanAddr(ref[0]) };
    }
    const fn = /^([A-Za-z]+)\(/.exec(s.slice(i));
    if (fn) {
      i += fn[0].length;
      const args: Node[] = [];
      if (peek() !== ")") {
        for (;;) {
          args.push(expr());
          if (peek() === ",") {
            i++;
            continue;
          }
          break;
        }
      }
      if (peek() !== ")") throw new Error(`Missing ) in ${src}`);
      i++;
      return { t: "call", name: fn[1].toUpperCase(), args };
    }
    throw new Error(`Unexpected "${s.slice(i, i + 10)}" in ${src}`);
  }

  function term(): Node {
    let a = primary();
    while (peek() === "*" || peek() === "/") {
      const op = s[i++];
      a = { t: "bin", op, a, b: primary() };
    }
    return a;
  }

  function expr(): Node {
    let a = term();
    while (peek() === "+" || peek() === "-" || peek() === "&") {
      const op = s[i++];
      a = { t: "bin", op, a, b: term() };
    }
    return a;
  }

  const node = expr();
  if (peek() !== undefined) throw new Error(`Unexpected "${s.slice(i)}" in ${src}`);
  return node;
}

const num = (v: Value): number => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : 0);

export interface CellSource {
  formula?: string;
  value?: Value;
}

// Evaluates every formula in a workbook. `cells` maps sheet name -> address -> cell.
// Inputs (values typed by the designer) override the template's own values.
export function evaluateWorkbook(
  cells: Record<string, Record<string, CellSource>>,
  inputs: Record<string, Record<string, Value>> = {},
): Record<string, Record<string, Value>> {
  const out: Record<string, Record<string, Value>> = {};
  const parsed = new Map<string, Node | null>();
  const busy = new Set<string>();

  function get(sheet: string, addr: string): Value {
    const key = `${sheet}!${addr}`;
    const done = out[sheet]?.[addr];
    if (done !== undefined) return done;
    const input = inputs[sheet]?.[addr];
    const cell = cells[sheet]?.[addr];
    let v: Value = null;
    if (input !== undefined && input !== null && input !== "") v = input;
    else if (cell?.formula) {
      if (busy.has(key)) return 0; // circular reference: treat as 0 like a fresh Excel sheet would show
      busy.add(key);
      let node = parsed.get(key);
      if (node === undefined) {
        try {
          node = parseFormula(cell.formula);
        } catch {
          node = null;
        }
        parsed.set(key, node);
      }
      v = node ? evalNode(node, sheet) : null;
      busy.delete(key);
    } else v = cell?.value ?? null;
    (out[sheet] ??= {})[addr] = v;
    return v;
  }

  function values(n: Node, sheet: string): Value[] {
    if (n.t === "range") return rangeAddrs(n.from, n.to).map((a) => get(n.sheet ?? sheet, a));
    return [evalNode(n, sheet)];
  }

  function evalNode(n: Node, sheet: string): Value {
    switch (n.t) {
      case "num":
      case "str":
        return n.v;
      case "ref":
        return get(n.sheet ?? sheet, n.addr);
      case "range":
        return values(n, sheet).reduce<number>((s, v) => s + num(v), 0);
      case "neg":
        return -num(evalNode(n.x, sheet));
      case "call": {
        const all = n.args.flatMap((a) => values(a, sheet));
        if (n.name === "SUM") return all.reduce<number>((s, v) => s + (typeof v === "string" ? 0 : num(v)), 0);
        if (n.name === "ROUND") return round(num(all[0]), num(all[1] ?? 0));
        throw new Error(`Unsupported function ${n.name}`);
      }
      case "bin": {
        const a = evalNode(n.a, sheet);
        const b = evalNode(n.b, sheet);
        if (n.op === "&") return `${a ?? ""}${b ?? ""}`;
        const x = num(a);
        const y = num(b);
        if (n.op === "+") return x + y;
        if (n.op === "-") return x - y;
        if (n.op === "*") return x * y;
        return y === 0 ? 0 : x / y;
      }
    }
  }

  for (const [sheet, sheetCells] of Object.entries(cells)) for (const addr of Object.keys(sheetCells)) get(sheet, addr);
  return out;
}

function round(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
