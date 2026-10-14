"use client";

import dynamic from "next/dynamic";

// pdf.js only runs in the browser, so the detail sheet editor is never rendered on the server.
const DetailEditor = dynamic(() => import("./DetailEditor"), { ssr: false, loading: () => <p className="muted">Loading sheet…</p> });

export default DetailEditor;
