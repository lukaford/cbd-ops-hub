import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite ships WASM and must load from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "pdfjs-dist", "exceljs"],
  // Migrations are read from disk on first connect, so ship them with the server code.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"], "/pdf-worker": ["./node_modules/pdfjs-dist/build/pdf.worker.min.mjs"], "/paperwork/**": ["./node_modules/pdfjs-dist/standard_fonts/*"] },
  // A full Special Orders paste runs to several hundred KB; phone photos of grids
  // and uploaded form templates run to several MB each.
  experimental: { serverActions: { bodySizeLimit: "40mb" } },
};

export default config;
