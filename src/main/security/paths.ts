import path from "node:path";
import fs from "node:fs";
import { getSettings } from "../database/db.js";
import { tt } from "../i18n.js";

/**
 * Todo acesso a arquivos do sistema passa por aqui.
 * O Workspace NUNCA acessa um diretório fora da allowlist configurada pelo usuário
 * em Configurações → "Diretórios autorizados".
 */

export class PathNotAllowedError extends Error {
  constructor(target: string) {
    super(tt("Acesso negado: \"{path}\" está fora dos diretórios autorizados.", { path: target }));
    this.name = "PathNotAllowedError";
  }
}

function normalize(p: string): string {
  return path.resolve(p);
}

/** Retorna true se `target` está dentro de `root` (ou é o próprio root). */
export function isWithin(root: string, target: string): boolean {
  const rel = path.relative(normalize(root), normalize(target));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Rejeita entradas que nunca deveriam chegar como caminho: bytes nulos,
 * caminhos de dispositivo do Windows (\\.\ e \\?\) e strings vazias.
 */
export function assertSanePathInput(target: string): void {
  if (typeof target !== "string" || target.trim().length === 0) {
    throw new Error("Caminho inválido.");
  }
  if (target.includes("\0")) throw new Error("Caminho inválido (byte nulo).");
  if (/^[\\/]{2}[?.][\\/]/.test(target)) throw new Error("Caminhos de dispositivo não são permitidos.");
}

/** Resolve links simbólicos/junctions quando o caminho existe; senão resolve o pai. */
function realpathIfPossible(p: string): string {
  try {
    return fs.realpathSync.native(p);
  } catch {
    const parent = path.dirname(p);
    if (parent === p) return p;
    return path.join(realpathIfPossible(parent), path.basename(p));
  }
}

/** Núcleo puro da verificação — exportado para testes. */
export function checkPathAgainstRoots(target: string, roots: string[]): string {
  assertSanePathInput(target);
  const resolved = normalize(target);
  if (roots.length === 0) throw new PathNotAllowedError(target);

  // 1ª camada: o caminho textual (já sem "..") precisa cair num root.
  const textualOk = roots.some((dir) => isWithin(dir, resolved));
  if (!textualOk) throw new PathNotAllowedError(target);

  // 2ª camada: o caminho REAL (seguindo symlinks/junctions) também precisa
  // cair num root — impede que um link dentro da pasta autorizada aponte
  // para fora dela (ex.: junction para C:\Windows).
  const real = realpathIfPossible(resolved);
  const realRoots = roots.map(realpathIfPossible);
  const realOk = realRoots.some((dir) => isWithin(dir, real));
  if (!realOk) throw new PathNotAllowedError(target);

  return resolved;
}

export function getAllowedDirs(): string[] {
  return getSettings().allowedProjectDirs.map(normalize);
}

/**
 * Lança PathNotAllowedError se o caminho não estiver dentro de nenhum diretório
 * autorizado. Resolve o caminho primeiro (path.resolve) para neutralizar
 * tentativas de path traversal via "..".
 */
export function assertPathAllowed(target: string): string {
  return checkPathAgainstRoots(target, getAllowedDirs());
}

/** Versão que também garante que o caminho existe. */
export function assertPathAllowedAndExists(target: string): string {
  const resolved = assertPathAllowed(target);
  if (!fs.existsSync(resolved)) {
    throw new Error(tt("Caminho não encontrado: {path}", { path: resolved }));
  }
  return resolved;
}

/** Nome de arquivo/pasta simples: sem separadores, sem "..", sem caracteres reservados do Windows. */
export function assertSafeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") throw new Error("Nome inválido.");
  if (/[\\/:*?"<>|\0]/.test(trimmed)) throw new Error('Nome contém caracteres inválidos (\\ / : * ? " < > |).');
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(trimmed)) throw new Error("Nome reservado pelo Windows.");
  if (trimmed.length > 255) throw new Error("Nome longo demais.");
  return trimmed;
}

/**
 * Diretórios que não podem ser autorizados por inteiro: raiz de unidade e
 * pastas do sistema. Autorizar "C:\" daria ao app acesso ao computador todo.
 */
export function assertAuthorizableDir(dir: string): string {
  assertSanePathInput(dir);
  const resolved = normalize(dir);
  if (path.parse(resolved).root === resolved) {
    throw new Error("Não é permitido autorizar a raiz de uma unidade. Escolha uma pasta específica.");
  }
  const systemDirs = [process.env.SystemRoot, process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.ProgramData]
    .filter((d): d is string => Boolean(d))
    .map(normalize);
  if (systemDirs.some((sys) => isWithin(sys, resolved) || isWithin(resolved, sys))) {
    throw new Error("Pastas do sistema operacional não podem ser autorizadas.");
  }
  const home = process.env.USERPROFILE ?? process.env.HOME;
  if (home && normalize(home) === resolved) {
    throw new Error("Autorize uma pasta específica (ex.: Documentos\\Projetos), não a pasta inteira do usuário.");
  }
  return resolved;
}
