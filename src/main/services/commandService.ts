import { getDb } from "../database/db.js";
import { assessCommand, EXTERNAL_COMMANDS } from "../security/commands.js";
import { runCapture } from "../security/exec.js";
import { assertPathAllowedAndExists } from "../security/paths.js";
import { createLogger } from "../logger.js";
import type { CommandAssessment, CommandRunResult } from "../../shared/types.js";

const log = createLogger("commands");

/**
 * Execução de comandos sugeridos pela IA. Fluxo obrigatório:
 *   1. renderer chama `assess` → mostra o diálogo de confirmação;
 *   2. só depois do clique do usuário chama `run` com `confirmed: true`.
 * A IA nunca chama `run` diretamente: não existe tool-calling com execução
 * automática no Workspace.
 */

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

export function isCommandAllowedAlways(command: string): boolean {
  const row = getDb().prepare("SELECT 1 FROM allowed_commands WHERE command = ?").get(normalizeCommand(command));
  return Boolean(row);
}

export function assess(command: string): CommandAssessment & { alwaysAllowed: boolean } {
  const assessment = assessCommand(command);
  return {
    ...assessment,
    // Comandos perigosos nunca contam como pré-autorizados.
    alwaysAllowed: assessment.risk !== "dangerous" && isCommandAllowedAlways(command),
  };
}

export function listAllowedCommands(): string[] {
  return (getDb().prepare("SELECT command FROM allowed_commands ORDER BY created_at DESC").all() as { command: string }[]).map(
    (r) => r.command
  );
}

export function revokeAllowedCommand(command: string): void {
  getDb().prepare("DELETE FROM allowed_commands WHERE command = ?").run(normalizeCommand(command));
}

export async function runCommand(input: {
  command: string;
  cwd: string;
  decision: "once" | "always";
}): Promise<CommandRunResult> {
  const cwd = assertPathAllowedAndExists(input.cwd);
  const assessment = assessCommand(input.command);

  if (input.decision === "always") {
    if (assessment.risk === "dangerous") {
      throw new Error("Comandos potencialmente destrutivos não podem ser autorizados permanentemente.");
    }
    getDb().prepare("INSERT OR IGNORE INTO allowed_commands (command) VALUES (?)").run(normalizeCommand(input.command));
  }

  log.info(`Executando comando confirmado pelo usuário (risco: ${assessment.risk})`);
  // O comando é um único argumento para o PowerShell: foi exibido ao usuário
  // exatamente assim e confirmado por ele. Não há concatenação com outros dados.
  const result = await runCapture(
    EXTERNAL_COMMANDS.powershell,
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", input.command],
    { cwd, timeoutMs: 5 * 60_000, maxOutputBytes: 200_000 }
  );
  return { exitCode: result.code, stdout: result.stdout, stderr: result.stderr, timedOut: result.timedOut };
}
