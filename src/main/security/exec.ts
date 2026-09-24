import { spawn } from "node:child_process";

/**
 * Wrapper único para disparar processos externos.
 *
 * Regras não-negociáveis:
 * - NUNCA usar `shell: true` com input do usuário interpolado numa string.
 * - Argumentos sempre passados como array (execve), nunca concatenados.
 * - Quem chama é responsável por validar/allowlistar o `command` em si
 *   (ver `security/commands.ts` para a lista do que pode ser executado).
 *
 * Isso elimina a classe inteira de vulnerabilidades de shell injection,
 * porque o SO nunca reinterpreta a string como um script de shell.
 */
export interface ExecOptions {
  cwd?: string;
  detached?: boolean;
  timeoutMs?: number;
  maxOutputBytes?: number;
  env?: NodeJS.ProcessEnv;
}

function assertNoShellMetaInExecutable(command: string): void {
  // .cmd/.bat só rodam via cmd.exe (que reinterpreta argumentos) — por isso
  // o Node recusa spawná-los sem shell (CVE-2024-27980). Nós também.
  if (/\.(cmd|bat)$/i.test(command)) {
    throw new Error("Executáveis .cmd/.bat não são permitidos sem shell; use o binário real.");
  }
}

export function spawnDetached(command: string, args: string[] = [], options: ExecOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    assertNoShellMetaInExecutable(command);
    const child = spawn(command, args, {
      cwd: options.cwd,
      detached: options.detached ?? true,
      stdio: "ignore",
      shell: false,
      windowsHide: false,
      env: options.env,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export function runCapture(
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<{ stdout: string; stderr: string; code: number | null; timedOut: boolean }> {
  const maxBytes = options.maxOutputBytes ?? 1_000_000;

  return new Promise((resolve, reject) => {
    assertNoShellMetaInExecutable(command);
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      env: options.env,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill();
        }, options.timeoutMs)
      : null;

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < maxBytes) stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < maxBytes) stderr += chunk.toString();
    });

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut });
    });
  });
}
