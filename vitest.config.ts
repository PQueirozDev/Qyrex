import { defineConfig } from "vitest/config";
import path from "node:path";

// Config separada do vite.config.ts (que é só do renderer).
// Os testes rodam no runtime Node do Electron — ver scripts/run-tests.mjs.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer"),
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    env: { NODE_ENV: "test" },
    pool: "forks",
  },
});
