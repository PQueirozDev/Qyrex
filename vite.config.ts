import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// CSP do build de produção (carregado via file://, onde cabeçalhos HTTP não se
// aplicam). Em dev, o main process envia uma CSP equivalente via cabeçalho,
// relaxada apenas para o HMR do Vite.
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://i.scdn.co https://*.spotifycdn.com https://avatars.githubusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  // Workers do editor (Monaco) são blobs: em file:// o Chromium não cria workers a partir de arquivo.
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
].join("; ");

function cspMeta(): Plugin {
  return {
    name: "workspace-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${PROD_CSP}" />`);
    },
  };
}

// Configuração do Vite apenas para o RENDERER (processo de UI).
// O processo main/preload é compilado separadamente pelo tsc (ver tsconfig.main.json).
export default defineConfig({
  root: path.resolve(__dirname, "src/renderer"),
  base: "./",
  plugins: [react(), cspMeta()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer"),
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist/renderer"),
    emptyOutDir: true,
    target: "chrome130",
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    strictPort: true,
    host: "localhost",
  },
});
