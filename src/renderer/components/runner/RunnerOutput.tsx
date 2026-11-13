import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { attempt } from "@/lib/api";

function cssColor(name: string, alpha?: number): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) return "#000";
  const rgb = value.split(/\s+/).join(", ");
  return alpha === undefined ? `rgb(${rgb})` : `rgba(${rgb}, ${alpha})`;
}

/**
 * Saída de um processo do runner, só leitura, com as cores ANSI do programa.
 * Ao trocar de processo, reescreve o que o main guardou e segue ao vivo.
 */
export function RunnerOutput({ processId }: { processId: string }) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const term = new Terminal({
      fontFamily: "Cascadia Code, Consolas, 'Courier New', monospace",
      fontSize: 12.5,
      disableStdin: true,
      cursorBlink: false,
      cursorStyle: "bar",
      cursorInactiveStyle: "none",
      convertEol: false,
      scrollback: 5000,
      minimumContrastRatio: 4.5,
      theme: {
        background: cssColor("--bg"),
        foreground: cssColor("--text"),
        cursor: cssColor("--bg"),
        selectionBackground: cssColor("--accent", 0.3),
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(box);
    fit.fit();

    // A saída ao vivo que chegar antes do histórico fica na fila, para não sair fora de ordem.
    let ready = false;
    const queue: string[] = [];
    const off = window.workspace.runner.onData(({ id, chunk }) => {
      if (id !== processId) return;
      if (ready) term.write(chunk);
      else queue.push(chunk);
    });
    void attempt(window.workspace.runner.output(processId)).then((text) => {
      term.write(text ?? "");
      ready = true;
      // O histórico já contém o que estava na fila até o momento da leitura: descarta a fila.
      queue.length = 0;
    });

    const resize = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // caixa escondida
      }
    });
    resize.observe(box);
    return () => {
      off();
      resize.disconnect();
      term.dispose();
    };
  }, [processId]);

  return <div ref={boxRef} className="h-full w-full overflow-hidden px-3 py-2" />;
}
