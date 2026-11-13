import type { WebContents } from "electron";
import { assertPathAllowedAndExists } from "../security/paths.js";
import { currentLanguage } from "../i18n.js";
import { streamOneShot } from "./aiService.js";
import { getChangedFiles, getFileDiff, getMyCommitsSince, getRecentCommits } from "./gitService.js";
import { getProject, listProjects } from "./projectService.js";
import { listTasks } from "./taskService.js";
import { listProcesses, getOutput } from "./runnerService.js";
import { listActivity } from "./recentService.js";

/**
 * Assistentes de IA para o dia a dia de dev. O contexto (diff, commits, tarefas)
 * é montado AQUI a partir do git e do banco: o renderer só diz o projeto e quais
 * arquivos estão marcados. A IA devolve texto; a UI só preenche um campo, nada roda.
 */

/** Limite do diff enviado (o suficiente para uma boa mensagem, sem estourar contexto). */
const MAX_DIFF_CHARS = 40_000;
const MAX_FILES = 30;

const languageName = () => (currentLanguage() === "en" ? "English" : "português do Brasil");

/** Junta os diffs dos arquivos escolhidos, cortando no limite. Exportado para testes. */
export function joinDiffs(diffs: { file: string; status: string; diff: string; binary: boolean }[], max = MAX_DIFF_CHARS): string {
  let out = "";
  for (const d of diffs) {
    const block = d.binary ? `--- ${d.file} (${d.status}, binário)\n` : `--- ${d.file} (${d.status})\n${d.diff}\n`;
    if (out.length + block.length > max) {
      out += `\n[... diff cortado: ${diffs.length} arquivos no total]\n`;
      break;
    }
    out += block;
  }
  return out;
}

export async function suggestCommitMessage(sender: WebContents, requestId: string, input: { projectId: string; files: string[] }): Promise<void> {
  const project = getProject(input.projectId);
  if (!project) throw new Error("Projeto não encontrado.");
  const dir = assertPathAllowedAndExists(project.localPath);
  const changes = await getChangedFiles(dir);
  // Só arquivos que de fato estão alterados no repositório (o renderer não inventa caminho).
  const wanted = new Set(input.files);
  const chosen = changes.filter((c) => wanted.has(c.path)).slice(0, MAX_FILES);
  if (chosen.length === 0) throw new Error("Marque pelo menos um arquivo alterado.");

  const diffs = await Promise.all(
    chosen.map(async (c) => {
      const d = await getFileDiff(dir, c.path).catch(() => null);
      return { file: c.path, status: c.status, diff: d?.diff ?? "", binary: d?.binary ?? false };
    })
  );
  const recent = (await getRecentCommits(dir, 8).catch(() => [])).map((c) => `- ${c.subject}`).join("\n");

  const system = [
    "Você escreve mensagens de commit de git.",
    `Escreva em ${languageName()}, a menos que os commits recentes do repositório estejam claramente em outro idioma: aí siga o idioma deles.`,
    "Siga o estilo dos commits recentes (por exemplo, Conventional Commits se eles usarem).",
    "Formato: primeira linha com no máximo 72 caracteres, no imperativo, sem ponto final. Se a mudança tiver várias partes, deixe uma linha em branco e liste os pontos principais com '- '.",
    "Responda SOMENTE com a mensagem do commit, sem explicações, sem aspas e sem bloco de código.",
  ].join("\n");
  const prompt = [
    `Projeto: ${project.name}`,
    recent ? `Commits recentes (para o estilo):\n${recent}` : "",
    `Arquivos e diff das alterações que vão no commit:\n\n${joinDiffs(diffs)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  streamOneShot(sender, requestId, system, prompt);
}

/** Início do "ontem útil": na segunda-feira, volta para a sexta. Exportado para testes. */
export function previousWorkdayStart(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const back = d.getDay() === 1 ? 3 : d.getDay() === 0 ? 2 : 1;
  d.setDate(d.getDate() - back);
  return d;
}

export async function dailyStandup(sender: WebContents, requestId: string): Promise<void> {
  const since = previousWorkdayStart();
  const projects = listProjects().filter((p) => !p.archivedAt);
  const perProject = await Promise.all(
    projects.slice(0, 30).map(async (p) => {
      try {
        const dir = assertPathAllowedAndExists(p.localPath);
        const commits = await getMyCommitsSince(dir, since.toISOString(), 30);
        return { name: p.name, commits };
      } catch {
        return { name: p.name, commits: [] };
      }
    })
  );
  const commitsText = perProject
    .filter((p) => p.commits.length > 0)
    .map((p) => `${p.name}:\n${p.commits.map((c) => `- ${c.subject}`).join("\n")}`)
    .join("\n\n");

  const tasks = listTasks();
  const sinceMs = since.getTime();
  const done = tasks.filter((t) => t.status === "concluido" && t.completedAt && Date.parse(t.completedAt) >= sinceMs);
  const doing = tasks.filter((t) => t.status === "em_andamento");
  const now = new Date();
  // "Hoje" no horário local (toISOString daria o dia em UTC).
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todo = tasks.filter((t) => t.status === "pendente" && t.dueDate && t.dueDate <= today);
  const list = (items: typeof tasks) => items.map((t) => `- ${t.title}${t.projectId ? ` (${projects.find((p) => p.id === t.projectId)?.name ?? ""})` : ""}`).join("\n");

  if (!commitsText && done.length === 0 && doing.length === 0 && todo.length === 0) {
    throw new Error("Sem commits seus nem tarefas desde o último dia útil para resumir.");
  }

  const system = [
    "Você ajuda um desenvolvedor a preparar a fala da reunião diária (daily/standup).",
    `Escreva em ${languageName()}, em Markdown curto, com três seções: "Ontem", "Hoje" e "Bloqueios".`,
    "Agrupe commits parecidos numa frase só, em linguagem humana (não copie as mensagens de commit literalmente).",
    "Em \"Hoje\", use as tarefas em andamento e as pendentes para hoje. Em \"Bloqueios\", escreva \"Nenhum\" se nada indicar bloqueio.",
    "Não invente trabalho que não está nos dados. Responda só com o texto da daily.",
  ].join("\n");
  const prompt = [
    `Desde: ${since.toLocaleDateString()}`,
    commitsText ? `Meus commits:\n${commitsText}` : "Meus commits: nenhum",
    done.length ? `Tarefas concluídas:\n${list(done)}` : "",
    doing.length ? `Tarefas em andamento:\n${list(doing)}` : "",
    todo.length ? `Pendentes para hoje (ou atrasadas):\n${list(todo)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  streamOneShot(sender, requestId, system, prompt);
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const ERROR_LINE = /\b(error|erro|failed|falhou|exception|fatal|cannot|unhandled)\b|ERR!/i;

/**
 * Pergunta livre à capivara. Só roda depois do consentimento marcado na UI (o
 * texto avisa o que vai). O contexto é um resumo montado aqui: tarefas abertas,
 * projetos, processos do runner (com as últimas linhas de erro) e atividade
 * recente. Nada de arquivos, caminhos completos, segredos ou conteúdo de .env.
 */
export function buddyAnswer(sender: WebContents, requestId: string, question: string): void {
  const projects = listProjects().filter((p) => !p.archivedAt);
  const name = (id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? "" : "");
  const tasks = listTasks()
    .filter((t) => t.status !== "concluido")
    .slice(0, 30)
    .map((t) => `- ${t.title}${t.projectId ? ` [${name(t.projectId)}]` : ""}${t.dueDate ? ` (prazo ${t.dueDate})` : ""} — ${t.status}`);
  const recentProjects = [...projects]
    .sort((a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""))
    .slice(0, 10)
    .map((p) => `- ${p.name}${p.technologies.length ? ` (${p.technologies.join(", ")})` : ""}${p.lastOpenedAt ? `, aberto em ${p.lastOpenedAt}` : ""}`);
  const processes = listProcesses()
    .slice(0, 8)
    .map((p) => {
      let errors: string[] = [];
      try {
        errors = [...new Set(getOutput(p.id).replace(ANSI, "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && ERROR_LINE.test(l)))].slice(-3);
      } catch {
        // processo removido no meio
      }
      return `- ${p.projectName}: ${p.script ?? p.command} — ${p.status}${p.urls.length ? ` em ${p.urls.join(", ")}` : ""}${errors.length ? `\n  erros: ${errors.map((e) => e.slice(0, 200)).join(" | ")}` : ""}`;
    });
  const activity = listActivity(10).map((a) => `- ${a.itemType}: ${a.label} (${a.openedAt})`);

  const system = [
    "Você é a capivara assistente do Qyrex, um app de desenvolvimento. Responda curto e prático.",
    `Responda em ${languageName()}.`,
    "Use SOMENTE os dados abaixo. Se a resposta não estiver neles, diga que não sabe; nunca invente tarefas, projetos, erros ou números.",
    "Você não executa nada: pode sugerir um comando, mas quem roda é o usuário.",
  ].join("\n");
  const prompt = [
    `Agora: ${new Date().toISOString()}`,
    `Tarefas abertas:\n${tasks.join("\n") || "nenhuma"}`,
    `Projetos (mais recentes primeiro):\n${recentProjects.join("\n") || "nenhum"}`,
    `Processos do Qyrex:\n${processes.join("\n") || "nenhum"}`,
    `Atividade recente:\n${activity.join("\n") || "nenhuma"}`,
    `Pergunta: ${question}`,
  ].join("\n\n");
  streamOneShot(sender, requestId, system, prompt);
}
