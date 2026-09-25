import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../database/db.js";
import { assertPathAllowed, assertPathAllowedAndExists } from "../security/paths.js";
import { getGitStatus, getRemoteGithubUrl, isGitRepo } from "./gitService.js";
import { recordActivity } from "./recentService.js";
import type { Project, ProjectDetection, ProjectWithGit } from "../../shared/types.js";
import { tt } from "../i18n.js";

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  local_path: string;
  technologies: string;
  github_url: string | null;
  client_id: string | null;
  favorite: number;
  created_at: string;
  last_opened_at: string | null;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    localPath: row.local_path,
    technologies: JSON.parse(row.technologies) as string[],
    githubUrl: row.github_url,
    clientId: row.client_id,
    favorite: Boolean(row.favorite),
    createdAt: row.created_at,
    lastOpenedAt: row.last_opened_at,
  };
}

export function listProjects(): Project[] {
  const rows = getDb()
    .prepare("SELECT * FROM projects ORDER BY favorite DESC, last_opened_at IS NULL, last_opened_at DESC, created_at DESC")
    .all() as ProjectRow[];
  return rows.map(rowToProject);
}

export function getProject(id: string): Project | null {
  const row = getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
  return row ? rowToProject(row) : null;
}

const KNOWN_DEPENDENCIES: Record<string, string> = {
  react: "React",
  "react-native": "React Native",
  next: "Next.js",
  vue: "Vue",
  nuxt: "Nuxt",
  svelte: "Svelte",
  "@angular/core": "Angular",
  vite: "Vite",
  typescript: "TypeScript",
  "@supabase/supabase-js": "Supabase",
  firebase: "Firebase",
  express: "Express",
  fastify: "Fastify",
  "@nestjs/core": "NestJS",
  electron: "Electron",
  tailwindcss: "Tailwind CSS",
  prisma: "Prisma",
  "@prisma/client": "Prisma",
  "discord.js": "Discord.js",
  telegraf: "Telegraf",
  "whatsapp-web.js": "WhatsApp Bot",
  puppeteer: "Puppeteer",
  playwright: "Playwright",
  "@playwright/test": "Playwright",
  mongoose: "MongoDB",
  pg: "PostgreSQL",
  mysql2: "MySQL",
  "@anthropic-ai/sdk": "Claude API",
  openai: "OpenAI API",
};

/** Heurística: package.json + arquivos-marcadores de outras stacks. */
export function detectTechnologies(projectPath: string): string[] {
  const techs = new Set<string>();
  const pkgPath = path.join(projectPath, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const [dep, label] of Object.entries(KNOWN_DEPENDENCIES)) {
        if (dep in deps) techs.add(label);
      }
      if (techs.size === 0) techs.add("Node.js");
    } catch {
      techs.add("Node.js");
    }
  }
  const markers: [string, string][] = [
    ["requirements.txt", "Python"],
    ["pyproject.toml", "Python"],
    ["composer.json", "PHP"],
    ["go.mod", "Go"],
    ["Cargo.toml", "Rust"],
    ["pom.xml", "Java"],
    ["Dockerfile", "Docker"],
    ["index.html", "HTML"],
  ];
  for (const [file, label] of markers) {
    if (fs.existsSync(path.join(projectPath, file))) techs.add(label);
  }
  return Array.from(techs);
}

/** Usado no diálogo "Novo projeto": pré-preenche nome, tecnologias e GitHub. */
export async function detectProject(projectPath: string): Promise<ProjectDetection> {
  const resolved = assertPathAllowedAndExists(projectPath);
  if (!fs.statSync(resolved).isDirectory()) throw new Error("Selecione uma pasta, não um arquivo.");
  const pkgPath = path.join(resolved, "package.json");
  let name: string | null = path.basename(resolved);
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { name?: string };
      if (pkg.name && !pkg.name.startsWith("@")) name = pkg.name;
    } catch {
      // package.json inválido: mantém o nome da pasta
    }
  }
  return {
    name,
    technologies: detectTechnologies(resolved),
    githubUrl: await getRemoteGithubUrl(resolved),
    hasPackageJson: fs.existsSync(pkgPath),
    isGitRepo: isGitRepo(resolved),
  };
}

export function createProject(input: {
  name: string;
  description?: string;
  localPath: string;
  technologies?: string[];
  githubUrl?: string;
  clientId?: string;
}): Project {
  // O caminho precisa estar dentro de um diretório autorizado pelo usuário.
  const resolvedPath = assertPathAllowedAndExists(input.localPath);
  if (!fs.statSync(resolvedPath).isDirectory()) throw new Error("O caminho do projeto precisa ser uma pasta.");

  const duplicate = getDb().prepare("SELECT name FROM projects WHERE local_path = ? COLLATE NOCASE").get(resolvedPath) as
    | { name: string }
    | undefined;
  if (duplicate) throw new Error(tt("Esta pasta já está cadastrada como \"{name}\".", { name: duplicate.name }));

  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO projects (id, name, description, local_path, technologies, github_url, client_id, favorite)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
    )
    .run(
      id,
      input.name,
      input.description ?? null,
      resolvedPath,
      JSON.stringify(input.technologies?.length ? input.technologies : detectTechnologies(resolvedPath)),
      input.githubUrl ?? null,
      input.clientId ?? null
    );
  return getProject(id)!;
}

export function updateProject(
  id: string,
  partial: Partial<Pick<Project, "name" | "description" | "technologies" | "githubUrl" | "clientId">>
): Project {
  const current = getProject(id);
  if (!current) throw new Error("Projeto não encontrado.");
  const merged = { ...current, ...partial };
  getDb()
    .prepare("UPDATE projects SET name = ?, description = ?, technologies = ?, github_url = ?, client_id = ? WHERE id = ?")
    .run(merged.name, merged.description, JSON.stringify(merged.technologies), merged.githubUrl, merged.clientId, id);
  return getProject(id)!;
}

export function toggleFavorite(id: string): void {
  getDb().prepare("UPDATE projects SET favorite = NOT favorite WHERE id = ?").run(id);
}

export function touchLastOpened(id: string): void {
  const project = getProject(id);
  if (!project) return;
  getDb().prepare("UPDATE projects SET last_opened_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(id);
  recordActivity("project", id, project.name);
}

/** Remove só o cadastro — a pasta no disco nunca é apagada por aqui. */
export function deleteProject(id: string): void {
  getDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
}

export async function listProjectsWithGit(): Promise<ProjectWithGit[]> {
  const projects = listProjects();
  return Promise.all(
    projects.map(async (p) => {
      let git = null;
      try {
        assertPathAllowed(p.localPath);
        git = await getGitStatus(p.localPath);
      } catch {
        git = null; // pasta removida ou fora da allowlist atual
      }
      return { ...p, git };
    })
  );
}
