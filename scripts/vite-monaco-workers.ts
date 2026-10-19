import type { Plugin } from "vite";

/**
 * O Monaco declara os workers de linguagem com `new Worker(new URL("x.worker.js",
 * import.meta.url))`, e o Vite emite uma cópia de cada um (ts.worker sozinho tem
 * ~7 MB). O Qyrex nunca usa essas cópias: `MonacoEnvironment.getWorker`
 * (src/renderer/lib/monaco.ts) tem prioridade e entrega os workers embutidos
 * (`?worker&inline`), os únicos que funcionam em file://. Este plugin troca o
 * `createWorker` cru por um erro explicativo, e as cópias mortas saem do build.
 */
const WORKER_MANAGER = /monaco-editor[\\/]esm[\\/]vs[\\/]languages[\\/]features[\\/](css|html|json|typescript)[\\/]workerManager\.js$/;
const RAW_WORKER = /createWorker:\s*\(\)\s*=>\s*new Worker\(new URL\('[\w.]+\.worker\.js', import\.meta\.url\), \{ type: "module" \}\)/;

export function monacoWorkersFromEnvironment(): Plugin {
  return {
    name: "qyrex-monaco-workers",
    enforce: "pre",
    transform(code, id) {
      if (!WORKER_MANAGER.test(id)) return null;
      if (!RAW_WORKER.test(code)) {
        // Monaco mudou o formato: falhar alto é melhor que voltar a inchar o build sem ninguém ver.
        this.error(`qyrex-monaco-workers: padrão do createWorker não encontrado em ${id}`);
      }
      return {
        code: code.replace(RAW_WORKER, 'createWorker: () => { throw new Error("Workers do Monaco vêm de MonacoEnvironment.getWorker (lib/monaco.ts)."); }'),
        map: null,
      };
    },
  };
}
