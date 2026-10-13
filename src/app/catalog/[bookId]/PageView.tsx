"use client";

import { useEffect, useRef, useState } from "react";

type PdfDoc = { numPages: number; getPage(n: number): Promise<unknown> };
const docs = new Map<string, Promise<PdfDoc>>();

async function openDoc(url: string): Promise<PdfDoc> {
  let p = docs.get(url);
  if (!p) {
    p = (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf-worker";
      return (await pdfjs.getDocument({ url, isEvalSupported: false }).promise) as unknown as PdfDoc;
    })();
    docs.set(url, p);
  }
  return p;
}

// One page of a price book, drawn in the browser at the width of the screen.
export default function PageView({ url, page }: { url: string; page: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    let task: { cancel(): void; promise: Promise<void> } | undefined;
    setState("loading");
    (async () => {
      try {
        const doc = await openDoc(url);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pg: any = await doc.getPage(page);
        const c = canvas.current;
        if (!c || cancelled) return;
        const base = pg.getViewport({ scale: 1 });
        const scale = ((c.parentElement?.clientWidth ?? 800) * zoom * (window.devicePixelRatio || 1)) / base.width;
        const vp = pg.getViewport({ scale });
        c.width = vp.width;
        c.height = vp.height;
        c.style.width = `${vp.width / (window.devicePixelRatio || 1)}px`;
        task = pg.render({ canvasContext: c.getContext("2d")!, viewport: vp });
        await task!.promise;
        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [url, page, zoom]);

  return (
    <div className="pageview">
      <div className="zoom noprint">
        <button type="button" className="btn" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out">
          −
        </button>
        {Math.round(zoom * 100)}%
        <button type="button" className="btn" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="Zoom in">
          +
        </button>
        {state === "loading" && <span className="muted">Loading page…</span>}
        {state === "error" && <span className="msg err">Could not draw this page.</span>}
      </div>
      <div className="pagecanvas">
        <canvas ref={canvas} />
      </div>
    </div>
  );
}
