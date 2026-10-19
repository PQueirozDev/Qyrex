import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, History, Lightbulb, MoreHorizontal, Pencil, Play, Plus, Trash2, Workflow } from "lucide-react";
import type { Automation, AutomationRun, AutomationStep, AutomationSuggestion, CommandAssessment } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Badge, EmptyState, Field, LoadingRows, Menu, PageHeader, Switch } from "@/components/ui/primitives";
import { RISK_LABEL, RISK_TONE, RUN_STATUS, RunAutomationDialog, RunView, StepIcon, stepText } from "@/components/AutomationRun";
import { attempt } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { tr, trn } from "@/lib/i18n";
import { PAGE_ICONS } from "@/lib/pageIcons";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { confirmAction, useUIStore } from "@/stores/useUIStore";
import { tm } from "@shared/i18n";

type StepKind = "command" | "vscode" | "explorer" | "terminal";
const KIND_LABEL: Record<StepKind, string> = {
  command: tm("Comando"),
  vscode: tm("Abrir no VS Code"),
  explorer: tm("Abrir no Explorer"),
  terminal: tm("Abrir terminal na pasta"),
};
const kindOf = (s: AutomationStep): StepKind => (s.kind === "command" ? "command" : s.target);
const stepOf = (kind: StepKind, command = ""): AutomationStep => (kind === "command" ? { kind: "command", command } : { kind: "open", target: kind });

/** Risco do comando, recalculado pelo main enquanto o usuário digita. */
function useAssessment(command: string): CommandAssessment | null {
  const [value, setValue] = useState<CommandAssessment | null>(null);
  useEffect(() => {
    if (!command.trim()) {
      setValue(null);
      return;
    }
    const t = window.setTimeout(() => {
      void window.workspace.commands.assess(command).then((r) => r.ok && setValue(r.data));
    }, 300);
    return () => window.clearTimeout(t);
  }, [command]);
  return value;
}

function StepRow({
  step,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  step: AutomationStep;
  index: number;
  count: number;
  onChange: (s: AutomationStep) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const assessment = useAssessment(step.kind === "command" ? step.command : "");
  return (
    <div className="space-y-1 rounded-lg border border-border-subtle p-2">
      <div className="flex items-center gap-1.5">
        <span className="w-4 shrink-0 text-right text-[11px] text-text-faint">{index + 1}</span>
        <select className="input w-48 py-1 text-xs" value={kindOf(step)} onChange={(e) => onChange(stepOf(e.target.value as StepKind, step.kind === "command" ? step.command : ""))}>
          {(Object.keys(KIND_LABEL) as StepKind[]).map((k) => (
            <option key={k} value={k}>
              {tr(KIND_LABEL[k])}
            </option>
          ))}
        </select>
        {step.kind === "command" ? (
          <input
            className="input min-w-0 flex-1 py-1 font-mono text-xs"
            value={step.command}
            maxLength={2000}
            placeholder="npm run build"
            onChange={(e) => onChange({ kind: "command", command: e.target.value })}
            aria-label={tr("Comando")}
          />
        ) : (
          <span className="flex-1" />
        )}
        <Button size="icon-sm" variant="ghost" onClick={() => onMove(-1)} disabled={index === 0} title={tr("Subir")} aria-label={tr("Subir")}>
          <ArrowUp size={12} />
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={() => onMove(1)} disabled={index === count - 1} title={tr("Descer")} aria-label={tr("Descer")}>
          <ArrowDown size={12} />
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={onRemove} title={tr("Remover passo")} aria-label={tr("Remover passo")}>
          <Trash2 size={12} />
        </Button>
      </div>
      {step.kind === "command" && assessment && (assessment.risk !== "safe" || assessment.reasons.length > 0) && (
        <p className="flex items-center gap-1.5 pl-6 text-[11px] text-text-faint">
          <Badge tone={RISK_TONE[assessment.risk]}>{tr(RISK_LABEL[assessment.risk])}</Badge>
          {assessment.reasons.join(" · ")}
        </p>
      )}
    </div>
  );
}

function AutomationEditor({ automation, defaultProjectId, onClose, onSaved }: { automation: Automation | "new"; defaultProjectId: string; onClose: () => void; onSaved: () => void }) {
  const allProjects = useProjectsStore((s) => s.projects);
  const projects = useMemo(() => allProjects.filter((p) => !p.archivedAt || (automation !== "new" && p.id === automation.projectId)), [allProjects, automation]);
  const editing = automation === "new" ? null : automation;
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [projectId, setProjectId] = useState(editing?.projectId ?? (defaultProjectId || projects[0]?.id || ""));
  const [steps, setSteps] = useState<AutomationStep[]>(editing ? editing.steps.map((s) => (s.kind === "command" ? { kind: "command", command: s.command } : { kind: "open", target: s.target })) : [{ kind: "command", command: "" }]);
  const [suggestions, setSuggestions] = useState<AutomationSuggestion[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!projectId || editing) return;
    void attempt(window.workspace.automations.suggest(projectId)).then((s) => setSuggestions(s ?? []));
  }, [projectId, editing]);

  const valid = name.trim() && projectId && steps.length > 0 && steps.every((s) => s.kind !== "command" || s.command.trim());

  function move(i: number, delta: -1 | 1) {
    setSteps((list) => {
      const next = [...list];
      [next[i], next[i + delta]] = [next[i + delta], next[i]];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    const input = { name: name.trim(), description: description.trim() || null, projectId, steps };
    const ok = editing ? await attempt(window.workspace.automations.update(editing.id, input), tr("Automação salva")) : await attempt(window.workspace.automations.create(input), tr("Automação criada"));
    setSaving(false);
    if (ok) {
      onSaved();
      onClose();
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissable={false}
      size="lg"
      title={editing ? tr("Editar automação") : tr("Nova automação")}
      description={tr("Passos que rodam em ordem na pasta do projeto, só quando você mandar executar.")}
      footer={
        <>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
            {tr("Cancelar")}
          </Button>
          <Button size="sm" onClick={() => void save()} loading={saving} disabled={!valid}>
            {tr("Salvar")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr("Nome")}>
            <input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={tr("Ex.: Verificar antes do deploy")} />
          </Field>
          <Field label={tr("Projeto")} hint={tr("Os comandos rodam na pasta dele.")}>
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={tr("Descrição")}>
          <input className="input" value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        {!editing && suggestions.length > 0 && (
          <div>
            <p className="label flex items-center gap-1">
              <Lightbulb size={12} /> {tr("Modelos para este projeto")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <Button
                  key={s.name}
                  size="xs"
                  variant="secondary"
                  onClick={() => {
                    setName(s.name);
                    setDescription(s.description ?? "");
                    setSteps(s.steps);
                  }}
                >
                  {s.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="label">{tr("Passos")}</p>
          <div className="space-y-1.5">
            {steps.map((s, i) => (
              <StepRow
                key={i}
                step={s}
                index={i}
                count={steps.length}
                onChange={(next) => setSteps((list) => list.map((x, j) => (j === i ? next : x)))}
                onMove={(d) => move(i, d)}
                onRemove={() => setSteps((list) => list.filter((_, j) => j !== i))}
              />
            ))}
          </div>
          <Button size="xs" variant="ghost" className="mt-1.5" onClick={() => setSteps((l) => [...l, { kind: "command", command: "" }])} disabled={steps.length >= 20}>
            <Plus size={12} /> {tr("Adicionar passo")}
          </Button>
          <p className="mt-1 text-[11px] text-text-faint">{tr("Cada comando roda no PowerShell, com limite de 5 minutos. Servidores que não terminam (ex.: npm run dev) devem ser abertos no Terminal.")}</p>
        </div>
      </div>
    </Dialog>
  );
}

function HistoryDialog({ automation, onClose }: { automation: Automation; onClose: () => void }) {
  const [runs, setRuns] = useState<AutomationRun[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    void attempt(window.workspace.automations.runs(automation.id)).then((r) => {
      setRuns(r ?? []);
      setSelected(r?.[0]?.id ?? null);
    });
  }, [automation.id]);
  const current = runs?.find((r) => r.id === selected) ?? null;
  return (
    <Dialog open onClose={onClose} size="xl" title={tr("Histórico de \"{name}\"", { name: automation.name })}>
      {runs === null ? (
        <LoadingRows rows={3} />
      ) : runs.length === 0 ? (
        <p className="text-sm text-text-faint">{tr("Esta automação ainda não foi executada.")}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {runs.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs ${r.id === selected ? "bg-bg-hover" : "hover:bg-bg-hover/60"}`}
              >
                <span className="text-text">{new Date(r.startedAt).toLocaleString()}</span>
                <Badge tone={RUN_STATUS[r.status].tone}>{tr(RUN_STATUS[r.status].label)}</Badge>
              </button>
            ))}
          </div>
          <div className="min-w-0">{current && <RunView key={current.id} run={current} />}</div>
        </div>
      )}
    </Dialog>
  );
}

export function Automations() {
  const pageParam = useUIStore((s) => s.pageParam);
  const { projects, loaded: projectsLoaded, load: loadProjects } = useProjectsStore();
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<Automation | "new" | null>(null);
  const [running, setRunning] = useState<Automation | null>(null);
  const [history, setHistory] = useState<Automation | null>(null);

  const load = useCallback(() => void attempt(window.workspace.automations.list()).then((a) => setAutomations(a ?? [])), []);
  useEffect(() => {
    load();
    if (!projectsLoaded) void loadProjects();
  }, [load, projectsLoaded, loadProjects]);
  // Vindo do drawer de um projeto: já filtra por ele.
  useEffect(() => {
    if (pageParam) setFilter(pageParam);
  }, [pageParam]);
  // Atualiza o "último resultado" quando uma execução termina.
  useEffect(() => window.workspace.automations.onProgress((r) => r.status !== "running" && load()), [load]);

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? tr("Projeto removido");
  const visible = (automations ?? []).filter((a) => !filter || a.projectId === filter);

  async function remove(a: Automation) {
    const ok = await confirmAction({
      title: tr("Excluir a automação \"{name}\"?", { name: a.name }),
      description: tr("A automação e o histórico de execuções dela saem do Qyrex. Nenhum arquivo do projeto é tocado."),
      danger: true,
      confirmLabel: tr("Excluir"),
    });
    if (!ok) return;
    await attempt(window.workspace.automations.delete(a.id), tr("Automação excluída"));
    load();
  }

  async function toggle(a: Automation, enabled: boolean) {
    setAutomations((list) => list?.map((x) => (x.id === a.id ? { ...x, enabled } : x)) ?? null);
    await attempt(window.workspace.automations.update(a.id, { enabled }));
  }

  return (
    <div>
      <PageHeader
        title={tr("Automações")}
        icon={PAGE_ICONS.automacoes}
        description={tr("Sequências de comandos e ações de um projeto. Nada roda sozinho: você confirma cada execução.")}
        actions={
          <>
            <select className="input w-52 py-1 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={tr("Filtrar por projeto")}>
              <option value="">{tr("Todos os projetos")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={() => setEditing("new")} disabled={projects.length === 0} title={projects.length === 0 ? tr("Adicione um projeto primeiro") : undefined}>
              <Plus size={14} /> {tr("Nova automação")}
            </Button>
          </>
        }
      />

      {automations === null ? (
        <LoadingRows rows={3} />
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={Workflow}
            title={tr("Nenhuma automação ainda")}
            description={tr("Crie rotinas como rodar testes, lint e build, checar o Git ou abrir o projeto no VS Code com um terminal. Há modelos prontos a partir dos scripts do projeto.")}
            action={
              projects.length > 0 ? (
                <Button size="sm" onClick={() => setEditing("new")}>
                  <Plus size={14} /> {tr("Nova automação")}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {visible.map((a) => {
            const worst = a.steps.some((s) => s.assessment.risk === "dangerous") ? "dangerous" : a.steps.some((s) => s.assessment.risk === "normal") ? "normal" : "safe";
            return (
              <Card key={a.id} className="flex flex-col p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-text">
                      <span className="truncate">{a.name}</span>
                      {worst === "dangerous" && <Badge tone="danger">{tr(RISK_LABEL.dangerous)}</Badge>}
                    </p>
                    <p className="truncate text-xs text-text-muted">{a.description || projectName(a.projectId)}</p>
                  </div>
                  <Switch checked={a.enabled} onChange={(v) => void toggle(a, v)} />
                  <Menu
                    trigger={<MoreHorizontal size={15} />}
                    items={[
                      { label: tr("Editar"), icon: Pencil, onSelect: () => setEditing(a) },
                      { label: tr("Histórico"), icon: History, onSelect: () => setHistory(a) },
                      "separator",
                      { label: tr("Excluir"), icon: Trash2, danger: true, onSelect: () => void remove(a) },
                    ]}
                  />
                </div>
                <div className="mt-3 space-y-1">
                  {a.steps.slice(0, 4).map((s, i) => (
                    <p key={i} className="flex items-center gap-1.5 truncate font-mono text-[11px] text-text-muted">
                      <StepIcon step={s} /> <span className="truncate">{stepText(s)}</span>
                    </p>
                  ))}
                  {a.steps.length > 4 && <p className="pl-5 text-[11px] text-text-faint">{trn(a.steps.length - 4, "+{n} passo", "+{n} passos")}</p>}
                </div>
                <div className="mt-auto flex items-center gap-2 border-t border-border-subtle pt-3 text-[11px] text-text-faint">
                  {a.lastRun ? (
                    <button className="flex items-center gap-1.5 hover:text-text" onClick={() => setHistory(a)}>
                      <Badge tone={RUN_STATUS[a.lastRun.status].tone}>{tr(RUN_STATUS[a.lastRun.status].label)}</Badge>
                      {timeAgo(a.lastRun.startedAt)}
                    </button>
                  ) : (
                    <span>{tr("Nunca executada")}</span>
                  )}
                  {filter === "" && <span className="truncate">· {projectName(a.projectId)}</span>}
                  <Button size="xs" className="ml-auto" onClick={() => setRunning(a)} disabled={!a.enabled}>
                    <Play size={12} /> {tr("Executar")}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing && <AutomationEditor automation={editing} defaultProjectId={filter} onClose={() => setEditing(null)} onSaved={load} />}
      <RunAutomationDialog automation={running} onClose={() => setRunning(null)} onDone={load} />
      {history && <HistoryDialog automation={history} onClose={() => setHistory(null)} />}
    </div>
  );
}
