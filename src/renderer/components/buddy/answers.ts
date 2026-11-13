import { attempt } from "@/lib/api";
import { timeAgo, todayISO } from "@/lib/format";
import { tr, trn } from "@/lib/i18n";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useRunnerStore } from "@/stores/useRunnerStore";
import { useTasksStore } from "@/stores/useTasksStore";

/**
 * Respostas da capivara para as perguntas prontas. Montadas só com dados reais
 * deste PC (tarefas, projetos, processos do runner, atividade). Nada vai para a rede
 * e nada é inventado: sem dado, a resposta diz que não há.
 */

export type QuickQuestion = "tasks" | "project" | "server" | "errors" | "activity";

export const QUICK_QUESTIONS: { id: QuickQuestion; label: () => string }[] = [
  { id: "tasks", label: () => tr("Quais tarefas tenho pendentes?") },
  { id: "project", label: () => tr("Em qual projeto estou?") },
  { id: "server", label: () => tr("Meu servidor está funcionando?") },
  { id: "errors", label: () => tr("Que erros apareceram?") },
  { id: "activity", label: () => tr("Resuma minha atividade") },
];

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const ERROR_LINE = /\b(error|erro|failed|falhou|exception|fatal|cannot|unhandled)\b|ERR!/i;

/** Linhas de erro da saída de um processo (sem cores, sem repetir). Exportado para testes. */
export function errorLines(output: string, max = 6): string[] {
  const lines = output.replace(ANSI, "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && ERROR_LINE.test(l));
  return [...new Set(lines)].slice(-max).map((l) => (l.length > 160 ? `${l.slice(0, 157)}...` : l));
}

export async function localAnswer(q: QuickQuestion): Promise<string> {
  switch (q) {
    case "tasks": {
      const store = useTasksStore.getState();
      if (!store.loaded) await store.load();
      const today = todayISO();
      const open = useTasksStore.getState().tasks.filter((t) => t.status !== "concluido");
      if (open.length === 0) return tr("Nenhuma tarefa pendente. Aproveite!");
      const late = open.filter((t) => t.dueDate && t.dueDate < today);
      const forToday = open.filter((t) => t.dueDate === today);
      const top = [...late, ...forToday, ...open.filter((t) => !late.includes(t) && !forToday.includes(t))].slice(0, 5);
      return [
        trn(open.length, "Você tem {n} tarefa pendente", "Você tem {n} tarefas pendentes") +
          (late.length ? trn(late.length, " ({n} atrasada).", " ({n} atrasadas).") : "."),
        ...top.map((t) => `• ${t.title}${t.dueDate && t.dueDate < today ? ` (${tr("atrasada")})` : t.dueDate === today ? ` (${tr("hoje")})` : ""}`),
      ].join("\n");
    }
    case "project": {
      const store = useProjectsStore.getState();
      if (!store.loaded) await store.load();
      const p = useProjectsStore
        .getState()
        .projects.filter((x) => !x.archivedAt && x.lastOpenedAt)
        .sort((a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""))[0];
      if (!p) return tr("Você ainda não abriu nenhum projeto pelo Qyrex.");
      const git = p.git?.isRepo
        ? trn(p.git.modifiedCount, " Branch {branch}, {n} alteração.", " Branch {branch}, {n} alterações.", { branch: p.git.branch ?? "?" })
        : "";
      return tr("O último projeto aberto foi {name}, {time}.", { name: p.name, time: timeAgo(p.lastOpenedAt!) }) + git;
    }
    case "server": {
      const running = useRunnerStore.getState().processes.filter((p) => p.status === "running");
      if (running.length === 0) return tr("Nenhum servidor rodando pelo Qyrex agora.");
      return running
        .map((p) =>
          p.urls.length
            ? tr("{project}: {name} rodando em {url}.", { project: p.projectName, name: p.script ?? p.command, url: p.urls[0] })
            : tr("{project}: {name} rodando (sem endereço na saída ainda).", { project: p.projectName, name: p.script ?? p.command })
        )
        .join("\n");
    }
    case "errors": {
      const procs = useRunnerStore.getState().processes.slice(0, 6);
      const found: string[] = [];
      for (const p of procs) {
        const out = await attempt(window.workspace.runner.output(p.id));
        const lines = out ? errorLines(out, 3) : [];
        if (lines.length) found.push(`${p.projectName} · ${p.script ?? p.command}:\n${lines.map((l) => `  ${l}`).join("\n")}`);
      }
      if (procs.length === 0) return tr("Não há processos do runner para olhar. Erros de terminais avulsos eu não leio.");
      return found.length ? found.join("\n\n") : tr("Nenhuma linha de erro na saída dos processos do runner.");
    }
    case "activity": {
      const items = (await attempt(window.workspace.activity.list(8))) ?? [];
      if (items.length === 0) return tr("Ainda não há atividade registrada.");
      return items.map((a) => `• ${a.label} (${timeAgo(a.openedAt)})`).join("\n");
    }
  }
}
