import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite ships WASM and must load from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
  // A full Special Orders paste runs to several hundred KB.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

export default config;
