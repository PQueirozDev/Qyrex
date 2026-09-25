import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Code2, FolderPlus, Plug, SquareTerminal, Trash2, User, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { attempt } from "@/lib/api";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { tr } from "@/lib/i18n";

const STEPS = [
  { title: tr("Pasta dos projetos"), icon: FolderPlus },
  { title: tr("VS Code"), icon: Code2 },
  { title: tr("Terminal"), icon: SquareTerminal },
  { title: tr("Seu nome"), icon: User },
  { title: tr("Integrações"), icon: Plug },
  { title: tr("Finalizar"), icon: Check },
];

/** Primeira execução: nada é obrigatório além de concluir — integrações externas são opcionais. */
export function Onboarding() {
  const { settings, system, update, addAllowedDir, removeAllowedDir, loadSystem } = useSettingsStore();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(settings?.userName ?? "");
  const [vscode, setVscode] = useState<string | null>(system?.vscodePath ?? null);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    setVscode(system?.vscodePath ?? null);
  }, [system]);

  if (!settings) return null;

  async function detect() {
    setDetecting(true);
    const found = await attempt(window.workspace.system.detectVSCode());
    setVscode(found ?? null);
    setDetecting(false);
  }

  async function pickVSCode() {
    const picked = await attempt(window.workspace.system.pickVSCode());
    if (picked) {
      setVscode(picked);
      void loadSystem();
    }
  }

  async function finish(goToIntegrations = false) {
    await update({ userName: name.trim() || "Pedro", onboardingCompleted: true });
    if (goToIntegrations) {
      const { useUIStore } = await import("@/stores/useUIStore");
      useUIStore.getState().navigate("integracoes");
    }
  }

  const StepIcon = STEPS[step].icon;

  return (
    <div className="flex h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-xl animate-pop-in">
        <div className="mb-4 flex justify-end">
          <div className="inline-flex rounded-lg border border-border-subtle bg-bg-elevated p-0.5">
            {(["pt", "en"] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => settings.language !== lang && void update({ language: lang })}
                className={cn(
                  "rounded-md px-2.5 py-1 font-mono text-[11px] font-semibold uppercase transition-colors",
                  settings.language === lang ? "bg-bg-card text-text shadow-sm ring-1 ring-border-subtle" : "text-text-muted hover:text-text"
                )}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-hover text-lg font-bold text-accent-fg shadow">Q</div>
          <h1 className="text-xl font-semibold tracking-tight text-text">{tr("Bem-vindo ao QrzSpace")}</h1>
          <p className="mt-1 text-sm text-text-muted">{tr("Vamos configurar o essencial. Leva menos de um minuto.")}</p>
        </div>

        <div className="mb-4 flex items-center justify-center gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s.title} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-6 bg-accent" : i < step ? "w-3 bg-accent/50" : "w-3 bg-border")} />
          ))}
        </div>

        <div className="rounded-xl border border-border bg-bg-elevated p-6 shadow-pop">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-text">
            <StepIcon size={16} className="text-accent" />
            {step + 1}. {STEPS[step].title}
          </div>

          {step === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-text-muted">{tr("Escolha as pastas onde ficam seus projetos e arquivos de clientes. O QrzSpace")}{" "}<strong className="text-text">{tr("só")}</strong>{" "}{tr("acessa o que estiver dentro delas — é a base da segurança do app.")}</p>
              {settings.allowedProjectDirs.map((dir) => (
                <div key={dir} className="flex items-center justify-between rounded-lg border border-border-subtle bg-bg px-3 py-2">
                  <span className="truncate font-mono text-xs text-text">{dir}</span>
                  <button onClick={() => void removeAllowedDir(dir)} className="text-text-faint hover:text-danger" aria-label={tr("Remover")}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <Button variant="secondary" onClick={() => void addAllowedDir()}>
                <FolderPlus size={15} />{" "}{tr("Escolher pasta...")}</Button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-text-muted">{tr("O QrzSpace abre projetos direto no VS Code.")}</p>
              <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg px-3 py-2.5">
                {vscode ? <CheckCircle2 size={16} className="text-success" /> : <XCircle size={16} className="text-text-faint" />}
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-text">{vscode ?? tr("VS Code não encontrado")}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => void detect()} loading={detecting}>{tr("Detectar novamente")}</Button>
                <Button variant="ghost" size="sm" onClick={() => void pickVSCode()}>{tr("Localizar Code.exe...")}</Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 gap-3">
              {(["powershell", "cmd"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => void update({ defaultTerminal: t })}
                  className={cn(
                    "rounded-lg border p-4 text-left transition-colors",
                    settings.defaultTerminal === t ? "border-accent bg-accent/10" : "border-border hover:bg-bg-hover"
                  )}
                >
                  <SquareTerminal size={18} className={settings.defaultTerminal === t ? "text-accent" : "text-text-faint"} />
                  <div className="mt-2 text-sm font-medium text-text">{t === "powershell" ? tr("PowerShell") : tr("CMD")}</div>
                  <div className="text-xs text-text-faint">{t === "powershell" ? tr("Recomendado") : tr("Prompt de comando clássico")}</div>
                </button>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-2">
              <p className="text-sm text-text-muted">{tr("Como você quer ser chamado no Dashboard?")}</p>
              <input className="input text-[15px]" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Pedro")} autoFocus />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3 text-sm text-text-muted">
              <p>{tr("Você pode conectar agora ou depois em Integrações — nada disso é obrigatório:")}</p>
              <ul className="grid grid-cols-2 gap-2 text-xs">
                {["Claude", "OpenAI", "Gemini", "GitHub", "Google Calendar", "Spotify"].map((i) => (
                  <li key={i} className="rounded-md border border-border-subtle bg-bg px-3 py-2 text-text">
                    {i}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-text-faint">{tr("Chaves e tokens ficam cifrados pelo cofre do Windows e nunca são exibidos por completo. Tudo o que é local (projetos, tarefas, clientes, agenda) funciona offline.")}</p>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-2 text-sm text-text-muted">
              <p>{name.trim() ? tr("Tudo pronto, {name}! Algumas dicas:", { name: name.trim() }) : tr("Tudo pronto! Algumas dicas:")}</p>
              <ul className="space-y-1.5 text-xs">
                <li>
                  <strong className="text-text">{tr("Ctrl+K")}</strong>{" "}{tr("— command palette (abrir projetos, criar tarefas, perguntar à IA)")}</li>
                <li>
                  <strong className="text-text">{tr("Ctrl+Shift+T")}</strong>{" "}{tr("— nova tarefa de qualquer lugar")}</li>
                <li>
                  <strong className="text-text">{tr("Ctrl+Shift+P")}</strong> / <strong className="text-text">{tr("Ctrl+Shift+A")}</strong>{" "}{tr("— Projetos / IA")}</li>
              </ul>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
              <ArrowLeft size={14} />{" "}{tr("Voltar")}</Button>
            {step < STEPS.length - 1 ? (
              <div className="flex gap-2">
                {step === 4 && (
                  <Button variant="secondary" size="sm" onClick={() => void finish(true)}>{tr("Conectar agora")}</Button>
                )}
                <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                  {step === 0 && settings.allowedProjectDirs.length === 0 ? tr("Pular") : tr("Continuar")} <ArrowRight size={14} />
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => void finish()}>{tr("Começar a usar")}</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
