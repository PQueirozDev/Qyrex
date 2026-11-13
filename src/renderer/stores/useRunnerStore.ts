import { create } from "zustand";
import type { RunnerProcess } from "@shared/types";
import { attempt } from "@/lib/api";
import { tr } from "@/lib/i18n";
import { confirmAction } from "@/stores/useUIStore";

interface RunnerState {
  processes: RunnerProcess[];
  initialized: boolean;
  /** Processo aberto na página Processos. */
  selectedId: string | null;
  init: () => void;
  select: (id: string | null) => void;
  /** Pede confirmação mostrando o comando exato e só então roda. */
  runScript: (projectId: string, script: string, command: string, packageManager: string) => Promise<RunnerProcess | null>;
  runCommand: (projectId: string, command: string) => Promise<RunnerProcess | null>;
  stop: (id: string) => Promise<void>;
  restart: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useRunnerStore = create<RunnerState>((set, get) => ({
  processes: [],
  initialized: false,
  selectedId: null,

  init: () => {
    if (get().initialized) return;
    set({ initialized: true });
    void attempt(window.workspace.runner.list()).then((list) => list && set({ processes: list }));
    // Inscrição única para o app inteiro (barra de status, página, drawer do projeto).
    window.workspace.runner.onChanged((processes) => set({ processes }));
  },
  select: (id) => set({ selectedId: id }),

  runScript: async (projectId, script, command, packageManager) => {
    const ok = await confirmAction({
      title: tr("Rodar o script {name}?", { name: script }),
      description: tr("Roda na pasta do projeto até você encerrar. O script executa:"),
      detail: `${packageManager} run ${script}\n\n${command}`,
      confirmLabel: tr("Rodar"),
    });
    if (!ok) return null;
    const proc = await attempt(window.workspace.runner.start({ projectId, script }, true));
    if (proc) set({ selectedId: proc.id });
    return proc ?? null;
  },
  runCommand: async (projectId, command) => {
    const assessment = await attempt(window.workspace.commands.assess(command));
    const dangerous = assessment?.risk === "dangerous";
    const ok = await confirmAction({
      title: tr("Rodar este comando?"),
      description: dangerous
        ? tr("Atenção: comando perigoso ({reasons}). Confira antes de rodar.", { reasons: assessment?.reasons.join(", ") ?? "" })
        : tr("Roda no PowerShell, na pasta do projeto, até você encerrar."),
      detail: command,
      danger: dangerous,
      confirmLabel: tr("Rodar"),
    });
    if (!ok) return null;
    const proc = await attempt(window.workspace.runner.start({ projectId, command }, true));
    if (proc) set({ selectedId: proc.id });
    return proc ?? null;
  },
  stop: async (id) => {
    await attempt(window.workspace.runner.stop(id));
  },
  restart: async (id) => {
    await attempt(window.workspace.runner.restart(id));
  },
  remove: async (id) => {
    const ok = await attempt(window.workspace.runner.remove(id));
    // `attempt` devolve undefined só quando falhou (sucesso de canal sem retorno vem como null).
    if (ok !== undefined && get().selectedId === id) set({ selectedId: null });
  },
}));

export const runningCount = (processes: RunnerProcess[]) => processes.filter((p) => p.status === "running").length;
