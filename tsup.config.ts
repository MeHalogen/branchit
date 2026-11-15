import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  minify: false,
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" },
  // Ink + React are shipped as deps; keep them external so the resolved
  // versions from node_modules are used at runtime.
  external: ["ink", "react", "execa"],
});
