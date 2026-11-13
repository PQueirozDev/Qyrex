import fs from "node:fs";
import path from "node:path";
import { assertPathAllowedAndExists } from "../security/paths.js";
import { getProject } from "./projectService.js";
import type { EnvCheck } from "../../shared/types.js";

/**
 * Confere as variáveis de ambiente do projeto: o que o `.env.example` pede e
 * falta no `.env`, o que sobra e o que está vazio. Só NOMES de variáveis saem
 * daqui: os valores nunca vão para o renderer, para logs ou para o banco.
 */

const EXAMPLE_FILES = [".env.example", ".env.sample", ".env.template", ".env.dist", "example.env"];
const ENV_FILES = [".env", ".env.local", ".env.development", ".env.development.local"];
const MAX_BYTES = 256_000;

/** Lê chaves de um arquivo dotenv: `CHAVE=valor`, `export CHAVE=valor`, comentários e aspas. Exportado para testes. */
export function parseDotenvKeys(text: string): Map<string, boolean> {
  // chave → tem valor (não vazio)
  const keys = new Map<string, boolean>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    // Sem aspas, "# comentário" no fim da linha não faz parte do valor.
    if (!/^["'`]/.test(value)) value = value.replace(/(?:^|\s+)#.*$/, "");
    value = value.replace(/^(["'`])([\s\S]*)\1$/, "$2");
    keys.set(m[1], value.length > 0);
  }
  return keys;
}

function readIfSmall(file: string): string | null {
  try {
    const stat = fs.lstatSync(file);
    // Link simbólico pode apontar para fora do projeto: não segue.
    if (!stat.isFile() || stat.size > MAX_BYTES) return null;
    return fs.readFileSync(file, "utf-8");
  } catch {
    return null;
  }
}

export function checkEnv(projectId: string): EnvCheck {
  const project = getProject(projectId);
  if (!project) throw new Error("Projeto não encontrado.");
  const dir = assertPathAllowedAndExists(project.localPath);

  const exampleName = EXAMPLE_FILES.find((f) => fs.existsSync(path.join(dir, f))) ?? null;
  const exampleText = exampleName ? readIfSmall(path.join(dir, exampleName)) : null;
  const example = exampleText !== null ? parseDotenvKeys(exampleText) : null;

  const envFiles: string[] = [];
  const env = new Map<string, boolean>();
  for (const name of ENV_FILES) {
    const text = readIfSmall(path.join(dir, name));
    if (text === null) continue;
    envFiles.push(name);
    // Arquivos mais específicos (.local) completam os gerais; valor preenchido em qualquer um conta.
    for (const [key, filled] of parseDotenvKeys(text)) env.set(key, (env.get(key) ?? false) || filled);
  }

  const missing = example ? [...example.keys()].filter((k) => !env.has(k)) : [];
  const extra = example ? [...env.keys()].filter((k) => !example.has(k)) : [];
  const empty = [...env.entries()].filter(([, filled]) => !filled).map(([k]) => k);
  return {
    exampleFile: example ? exampleName : null,
    envFiles,
    expected: example ? example.size : 0,
    defined: env.size,
    missing: missing.sort(),
    extra: extra.sort(),
    empty: empty.sort(),
  };
}
