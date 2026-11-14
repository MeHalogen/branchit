import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests spawn real git processes and create temp repos, so
    // keep a generous timeout and avoid cross-test interference.
    testTimeout: 45000,
    hookTimeout: 20000,
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    environment: "node",
  },
});
