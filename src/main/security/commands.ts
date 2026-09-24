import type { CommandAssessment } from "../../shared/types.js";

/**
 * Allowlist central do que o Workspace tem permissão de abrir/executar.
 * Nada fora daqui é executado — nem por clique do usuário, nem por uma IA.
 */

export const ALLOWED_PROTOCOLS = ["https:", "http:", "mailto:", "tel:"] as const;

/** Protocolos de apps desktop que o Workspace pode abrir (sem parâmetros arbitrários). */
export const ALLOWED_APP_URLS = ["whatsapp://", "spotify:"] as const;

export function isProtocolAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!(ALLOWED_PROTOCOLS as readonly string[]).includes(parsed.protocol)) return false;
    // Credenciais embutidas na URL (https://user:pass@host) nunca são abertas.
    if (parsed.username || parsed.password) return false;
    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.hostname) return false;
    return true;
  } catch {
    return false;
  }
}

/** Comandos externos que o app tem permissão de spawnar (sem shell). */
export const EXTERNAL_COMMANDS = {
  powershell: "powershell.exe",
  cmd: "cmd.exe",
  git: "git",
} as const;

/**
 * Ações que exigem confirmação explícita do usuário antes de rodar,
 * como descrito na spec de segurança (nunca deletar/push automaticamente).
 */
export const SENSITIVE_ACTIONS = new Set([
  "file.delete",
  "file.move",
  "git.commit",
  "git.push",
  "git.pull",
  "shell.run",
]);

export function isSensitive(actionId: string): boolean {
  return SENSITIVE_ACTIONS.has(actionId);
}

// --- Classificação de risco de comandos de terminal ---------------------------

/**
 * Padrões que tornam um comando PERIGOSO: destroem dados, alteram o sistema,
 * publicam código, instalam programas globalmente ou executam código baixado.
 * Comandos perigosos sempre exigem a confirmação "⚠️ AÇÃO SENSÍVEL" e nunca
 * podem ser marcados como "Permitir sempre".
 */
const DANGEROUS_PATTERNS: [RegExp, string][] = [
  [/\b(rm|rmdir|rd|del|erase|Remove-Item|ri)\b/i, "remove arquivos ou pastas"],
  [/\bformat(\.com)?\s+[a-z]:|\b(diskpart|mkfs(\.\w+)?|fdisk|Format-Volume|Clear-Disk)\b/i, "formata/particiona discos"],
  [/\bgit\s+push\b/i, "publica commits no repositório remoto"],
  [/\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|checkout\s+--\s|restore\b|branch\s+-D|stash\s+(drop|clear)|rebase|filter-branch)/i, "descarta alterações do Git"],
  [/\b(npm|pnpm|yarn)\s+(publish|unpublish)\b/i, "publica pacotes"],
  [/\b(npm|pnpm)\s+(i|install|add)\s+(-g|--global)\b|\byarn\s+global\b/i, "instala pacotes globalmente"],
  [/\b(winget|choco|scoop|msiexec|apt|apt-get|brew)\b/i, "instala/remove programas do sistema"],
  [/\b(shutdown|restart-computer|stop-computer|reg\s+(add|delete)|Set-ItemProperty|New-ItemProperty|bcdedit|sc\s+(delete|config)|Stop-Service|takeown|icacls|attrib)\b/i, "altera o sistema operacional"],
  [/\b(Set-ExecutionPolicy|Start-Process\s+.*-Verb\s+RunAs|runas|sudo)\b/i, "eleva privilégios"],
  [/\b(curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b.*\|\s*(sh|bash|iex|Invoke-Expression|powershell|pwsh)\b/i, "executa script baixado da internet"],
  [/\b(iex|Invoke-Expression)\b/i, "executa código dinâmico"],
  [/-EncodedCommand\b|\s-enc\s/i, "executa comando ofuscado"],
  [/\b(Move-Item|move|mv|ren|Rename-Item)\b/i, "move/renomeia arquivos"],
  [/(^|[^>])>\s*[^&\s]/, "sobrescreve arquivo via redirecionamento"],
  [/\b(npx|pnpx|bunx)\s+\S*(rimraf|del-cli)\b/i, "remove arquivos"],
  [/\b(docker|kubectl)\s+(rm|rmi|delete|system\s+prune|volume\s+rm)\b/i, "remove recursos de infraestrutura"],
  [/\b(DROP|TRUNCATE)\s+(TABLE|DATABASE)\b/i, "apaga dados de banco"],
];

/** Comandos somente-leitura, considerados seguros (ainda assim o usuário confirma a 1ª vez). */
const SAFE_PATTERNS: RegExp[] = [
  /^(git\s+(status|log|diff|branch|show|remote\s+-v|fetch))(\s|$)/i,
  /^(ls|dir|pwd|Get-ChildItem|Get-Location|cat|type|Get-Content|echo|node\s+(-v|--version)|npm\s+(-v|--version|ls|list|outdated|run\s+(lint|test|typecheck|build)))(\s|$)/i,
  /^(npm|pnpm|yarn)\s+(test|run\s+test)(\s|$)/i,
];

export function assessCommand(command: string): CommandAssessment {
  const trimmed = command.trim();
  if (!trimmed) return { risk: "dangerous", reasons: ["comando vazio"] };

  const reasons = DANGEROUS_PATTERNS.filter(([pattern]) => pattern.test(trimmed)).map(([, reason]) => reason);
  if (reasons.length > 0) return { risk: "dangerous", reasons: Array.from(new Set(reasons)) };

  // Encadeamento (;, &&, ||, |, `, $()) só é "seguro" se cada parte for segura.
  const parts = trimmed.split(/;|&&|\|\||\||\n/).map((p) => p.trim()).filter(Boolean);
  const hasSubshell = /`|\$\(/.test(trimmed);
  if (!hasSubshell && parts.every((part) => SAFE_PATTERNS.some((pattern) => pattern.test(part)))) {
    return { risk: "safe", reasons: [] };
  }
  return { risk: "normal", reasons: hasSubshell ? ["usa subcomando/expansão"] : [] };
}
