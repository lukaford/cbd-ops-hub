import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite ships WASM and must load from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "pdfjs-dist", "exceljs"],
  // Migrations are read from disk on first connect, so ship them with the server code.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"], "/pdf-worker": ["./node_modules/pdfjs-dist/build/pdf.worker.min.mjs"], "/paperwork/**": ["./node_modules/pdfjs-dist/standard_fonts/*"], "/catalog/**": ["./node_modules/pdfjs-dist/standard_fonts/*"] },
  // A full Special Orders paste runs to several hundred KB; phone photos of grids,
  // form templates and the price books (about 56 MB together) run to several MB each.
  // The sign-in middleware sees uploads first, so it needs the same allowance.
  experimental: { serverActions: { bodySizeLimit: "100mb" }, middlewareClientMaxBodySize: "100mb" },
};

export default config;
