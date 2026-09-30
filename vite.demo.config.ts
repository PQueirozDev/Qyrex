import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Build da DEMO WEB do Qyrex (vai para o site do portfólio): a interface real
// do renderer com `window.workspace` simulado (src/demo/workspaceMock.ts).
// Uso: npm run build:demo  →  dist-demo/
export default defineConfig({
  root: path.resolve(__dirname, "src/demo"),
  base: "./",
  publicDir: false,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer"),
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist-demo"),
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 1500,
  },
});
