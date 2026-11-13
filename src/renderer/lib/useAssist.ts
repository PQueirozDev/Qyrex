import { useCallback, useEffect, useRef, useState } from "react";
import type { IpcResult } from "@shared/types";

/**
 * Acompanha uma geração avulsa da IA (assistentes): dispara o pedido e junta os
 * pedaços que chegam por `ai.onStream` com o mesmo requestId. `onText` recebe o
 * texto acumulado a cada pedaço (ex.: preencher o campo da mensagem de commit).
 */
export function useAssist(onText?: (text: string) => void) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<string | null>(null);
  const textRef = useRef("");
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(
    () =>
      window.workspace.ai.onStream((chunk) => {
        if (chunk.requestId !== requestRef.current) return;
        if (chunk.type === "delta" && chunk.text) {
          textRef.current += chunk.text;
          setText(textRef.current);
          onTextRef.current?.(textRef.current.trim());
        } else if (chunk.type === "done") {
          requestRef.current = null;
          setRunning(false);
        } else if (chunk.type === "error") {
          requestRef.current = null;
          setRunning(false);
          setError(chunk.error ?? null);
        }
      }),
    []
  );

  const start = useCallback(async (call: (requestId: string) => Promise<IpcResult<void>>) => {
    const requestId = crypto.randomUUID();
    requestRef.current = requestId;
    textRef.current = "";
    setText("");
    setError(null);
    setRunning(true);
    const res = await call(requestId);
    if (!res.ok && requestRef.current === requestId) {
      requestRef.current = null;
      setRunning(false);
      setError(res.error);
    }
  }, []);

  const stop = useCallback(() => {
    const id = requestRef.current;
    if (id) void window.workspace.ai.interrupt(id);
  }, []);

  return { text, running, error, start, stop };
}
