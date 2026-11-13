import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { StatusBar } from "@/components/StatusBar";
import { CapyBuddy, useBuddyEvents } from "@/components/buddy/CapyBuddy";
import { usePluginsStore } from "@/stores/usePluginsStore";
import { actionFor, comboOf } from "@/lib/shortcuts";
import { CommandPalette } from "@/components/CommandPalette";
import { FocusDialogs } from "@/components/Focus";
import { ConfirmHost, PromptHost, Toaster } from "@/components/Overlays";
import { TaskFormDialog } from "@/components/TaskFormDialog";
import { Spinner } from "@/components/ui/primitives";
import { Dashboard } from "@/pages/Dashboard";
import { Onboarding } from "@/pages/Onboarding";
import { PAGES, useUIStore, type Page } from "@/stores/useUIStore";
import { applyTheme, useSettingsStore } from "@/stores/useSettingsStore";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { UpdateBanner, WhatsNewDialog } from "@/components/UpdateBanner";
import { syncLanguage } from "@/lib/i18n";

// Páginas carregadas sob demanda: o app abre rápido e só paga o custo de
// markdown/highlight (IA) ou xterm (Terminal) quando a página é usada.
const Projects = lazy(() => import("@/pages/Projects").then((m) => ({ default: m.Projects })));
const Tasks = lazy(() => import("@/pages/Tasks").then((m) => ({ default: m.Tasks })));
const FilesPage = lazy(() => import("@/pages/FilesPage").then((m) => ({ default: m.FilesPage })));
const Settings = lazy(() => import("@/pages/Settings").then((m) => ({ default: m.Settings })));
const AICenter = lazy(() => import("@/pages/AICenter").then((m) => ({ default: m.AICenter })));
const Integrations = lazy(() => import("@/pages/Integrations").then((m) => ({ default: m.Integrations })));
const Agenda = lazy(() => import("@/pages/Agenda").then((m) => ({ default: m.Agenda })));
const PatchNotes = lazy(() => import("@/pages/PatchNotes").then((m) => ({ default: m.PatchNotes })));
const Notion = lazy(() => import("@/pages/Notion").then((m) => ({ default: m.Notion })));
const TerminalPage = lazy(() => import("@/pages/TerminalPage").then((m) => ({ default: m.TerminalPage })));
const Automations = lazy(() => import("@/pages/Automations").then((m) => ({ default: m.Automations })));
const ProcessesPage = lazy(() => import("@/pages/ProcessesPage").then((m) => ({ default: m.ProcessesPage })));
const WorkspacePage = lazy(() => import("@/pages/WorkspacePage").then((m) => ({ default: m.WorkspacePage })));
const PluginsPage = lazy(() => import("@/pages/PluginsPage").then((m) => ({ default: m.PluginsPage })));
const PreviewPage = lazy(() => import("@/pages/PreviewPage").then((m) => ({ default: m.PreviewPage })));
const ToolsPage = lazy(() => import("@/pages/ToolsPage").then((m) => ({ default: m.ToolsPage })));
const EditorPage = lazy(() => import("@/pages/EditorPage").then((m) => ({ default: m.EditorPage })));

function PageView({ page }: { page: Page }) {
  switch (page) {
    case "inicio":
      return <Dashboard />;
    case "projetos":
      return <Projects />;
    case "terminal":
    case "editor":
    case "workspace":
      return null; // ficam sempre montados (ver PersistentPage): shells e edições não salvas sobrevivem à troca de página
    case "tarefas":
      return <Tasks />;
    case "automacoes":
      return <Automations />;
    case "processos":
      return <ProcessesPage />;
    case "ferramentas":
      return <ToolsPage />;
    case "preview":
      return <PreviewPage />;
    case "plugins":
      return <PluginsPage />;
    case "arquivos":
      return <FilesPage />;
    case "configuracoes":
      return <Settings />;
    case "ia":
      return <AICenter />;
    case "agenda":
      return <Agenda />;
    case "notion":
      return <Notion />;
    case "integracoes":
      return <Integrations />;
    case "novidades":
      return <PatchNotes />;
  }
}

/**
 * Terminal e Editor são montados na primeira visita e depois só escondidos:
 * desmontar encerraria os shells abertos / perderia as abas do editor.
 */
function PersistentPage({ visible, children }: { visible: boolean; children: (visible: boolean) => ReactNode }) {
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);
  if (!mounted) return null;
  return (
    <div className={visible ? "h-full animate-page-in" : "hidden"}>
      <Suspense
        fallback={
          <div className="flex h-40 items-center justify-center">
            <Spinner />
          </div>
        }
      >
        {children(visible)}
      </Suspense>
    </div>
  );
}

/** Páginas que ocupam a altura toda (sem padding/scroll do layout). */
const FULL_BLEED: Page[] = ["ia", "terminal", "editor", "notion", "processos", "preview", "workspace"];

export function App() {
  const page = useUIStore((s) => s.page);
  const terminalOnlyPref = useUIStore((s) => s.terminalOnly);
  const navigate = useUIStore((s) => s.navigate);
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);
  const quickTaskOpen = useUIStore((s) => s.quickTaskOpen);
  const setQuickTaskOpen = useUIStore((s) => s.setQuickTaskOpen);
  const setOnline = useUIStore((s) => s.setOnline);
  const { settings, load, loadSystem, loadAvatar } = useSettingsStore();
  useBuddyEvents();
  const loadPlugins = usePluginsStore((s) => s.load);
  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  useEffect(() => {
    void load();
    void loadSystem();
    void loadAvatar();
  }, [load, loadSystem, loadAvatar]);

  useEffect(() => (settings ? applyTheme(settings.theme) : undefined), [settings?.theme, settings]);

  // Idioma salvo no banco manda: se diferente do atual, recarrega a janela.
  useEffect(() => {
    if (settings) syncLanguage(settings.language);
  }, [settings?.language, settings]);

  // Discord Rich Presence: informa a área atual (e o projeto, se aberto).
  const pageParam = useUIStore((s) => s.pageParam);
  const projects = useProjectsStore((s) => s.projects);
  const discordOn = settings?.discord.enabled ?? false;
  useEffect(() => {
    if (!discordOn) return;
    const project = pageParam ? projects.find((p) => p.id === pageParam)?.name ?? null : null;
    void window.workspace.discord.setActivity(page, project);
  }, [page, pageParam, projects, discordOn]);

  // Modo compacto: a classe no <html> reduz a escala de espaçamento do app inteiro.
  const compact = useUIStore((s) => s.compact);
  useEffect(() => {
    document.documentElement.classList.toggle("compact", compact);
  }, [compact]);

  // Atalhos globais (dentro da janela), configuráveis em Configurações → Atalhos.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Teclas já tratadas por outro componente (ex.: atalhos do editor de código) não disparam os globais.
      if (e.defaultPrevented) return;
      const action = actionFor(useUIStore.getState().shortcuts, comboOf(e));
      if (!action) return;
      e.preventDefault();
      if (action === "palette") setPaletteOpen(!useUIStore.getState().paletteOpen);
      else if (action === "quickTask") setQuickTaskOpen(true);
      else if (action === "projects") navigate("projetos");
      else if (action === "ai") navigate("ia");
      else if (action === "workspace") navigate("workspace");
      else if (action === "preview") navigate("preview");
      else if (action === "sidebar") useUIStore.getState().setSidebarCollapsed(!useUIStore.getState().sidebarCollapsed);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, setPaletteOpen, setQuickTaskOpen]);

  // Comandos vindos do main process (menu da bandeja, clique em notificação).
  useEffect(() => {
    const offCommand = window.workspace.app.onCommand((command) => {
      if (command === "new-task") setQuickTaskOpen(true);
      if (command === "open-projects") navigate("projetos");
      if (command === "open-ai") navigate("ia");
      if (command === "open-palette") setPaletteOpen(true);
    });
    const offNavigate = window.workspace.app.onNavigate((target) => {
      if ((PAGES as string[]).includes(target)) navigate(target as Page);
    });
    return () => {
      offCommand();
      offNavigate();
    };
  }, [navigate, setPaletteOpen, setQuickTaskOpen]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [setOnline]);

  if (!settings) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <Spinner />
      </div>
    );
  }

  if (!settings.onboardingCompleted) {
    return (
      <>
        <div className="fixed inset-x-0 top-0 z-40">
          <UpdateBanner />
        </div>
        <Onboarding />
        <Toaster />
        <ConfirmHost />
      </>
    );
  }

  const fullBleed = FULL_BLEED.includes(page);
  // Modo "só terminais": a página Terminal ocupa a janela inteira.
  const terminalOnly = terminalOnlyPref && page === "terminal";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-text">
      {!terminalOnly && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!terminalOnly && <Header />}
        <UpdateBanner />
        <main className={fullBleed ? "min-h-0 flex-1 overflow-hidden" : "app-ambient flex-1 overflow-y-auto"}>
          {page !== "terminal" && page !== "editor" && page !== "workspace" && (
            <div key={page} className={fullBleed ? "h-full animate-page-in" : "mx-auto max-w-[1400px] animate-page-in px-7 py-6"}>
              <Suspense
                fallback={
                  <div className="flex h-40 items-center justify-center">
                    <Spinner />
                  </div>
                }
              >
                <PageView page={page} />
              </Suspense>
            </div>
          )}
          <PersistentPage visible={page === "terminal"}>{(visible) => <TerminalPage visible={visible} />}</PersistentPage>
          <PersistentPage visible={page === "editor"}>{(visible) => <EditorPage visible={visible} />}</PersistentPage>
          <PersistentPage visible={page === "workspace"}>{(visible) => <WorkspacePage visible={visible} />}</PersistentPage>
        </main>
        {!terminalOnly && <StatusBar />}
      </div>

      {!terminalOnly && <CapyBuddy />}
      <CommandPalette />
      <FocusDialogs />
      <TaskFormDialog open={quickTaskOpen} onClose={() => setQuickTaskOpen(false)} />
      <ConfirmHost />
      <PromptHost />
      <WhatsNewDialog />
      <Toaster />
    </div>
  );
}
