import type { IpcResult } from "@shared/types";
import { toast } from "@/stores/useUIStore";

/** Converte IpcResult em valor ou exceção. */
export async function unwrap<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const res = await promise;
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

/**
 * Executa uma chamada IPC mostrando toast de erro (e opcionalmente de sucesso).
 * Retorna `undefined` em caso de erro — nunca deixa a UI quebrar.
 */
export async function attempt<T>(promise: Promise<IpcResult<T>>, success?: string): Promise<T | undefined> {
  try {
    const data = await unwrap(promise);
    if (success) toast.success(success);
    return data;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
    return undefined;
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
