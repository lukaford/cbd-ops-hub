"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signPacket } from "../../actions";

export default function SignaturePad(props: { packetId: number; role: "customer" | "designer"; hash: string; consent: string; defaultName: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [drawn, setDrawn] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvas.current!.getContext("2d")!;
    const p = point(e);
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b1f4d";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    drawing.current = true;
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setDrawn(true);
  };
  const up = () => {
    drawing.current = false;
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setDrawn(false);
  };

  async function submit(form: FormData) {
    setError("");
    if (!drawn) {
      setError("Draw your signature in the box.");
      return;
    }
    setBusy(true);
    form.set("image", canvas.current!.toDataURL("image/png"));
    const r = await signPacket(form);
    setBusy(false);
    if (!r.ok) setError(r.error ?? "Could not save the signature.");
    else router.push(`/paperwork/${props.packetId}?signed=${props.role}#signatures`);
  }

  return (
    <form action={submit} className="panel stack signform">
      <input type="hidden" name="packetId" value={props.packetId} />
      <input type="hidden" name="role" value={props.role} />
      <input type="hidden" name="hash" value={props.hash} />
      <label>
        Full name <input name="name" defaultValue={props.defaultName} required autoComplete="name" />
      </label>
      <label>
        Email (optional, for your copy) <input name="email" type="email" autoComplete="email" />
      </label>
      <div className="padbox">
        <canvas ref={canvas} width={1000} height={300} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} aria-label="Signature box: sign with your finger or a stylus" />
        <span className="line">Sign above</span>
      </div>
      <label className="chk">
        <input type="checkbox" name="consent" required /> {props.consent}
      </label>
      {error && <p className="msg err">{error}</p>}
      <div className="actions">
        <button className="btn" type="button" onClick={clear}>
          Clear
        </button>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Sign"}
        </button>
      </div>
    </form>
  );
}
