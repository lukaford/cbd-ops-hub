"use client";

import dynamic from "next/dynamic";

// pdf.js only runs in the browser.
const PageView = dynamic(() => import("./PageView"), { ssr: false, loading: () => <p className="muted">Loading page…</p> });

export default PageView;
