import { lazy, Suspense, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { CommandPalette } from "@/components/CommandPalette";
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
const Clients = lazy(() => import("@/pages/Clients").then((m) => ({ default: m.Clients })));
const Marketing = lazy(() => import("@/pages/Marketing").then((m) => ({ default: m.Marketing })));
const Agenda = lazy(() => import("@/pages/Agenda").then((m) => ({ default: m.Agenda })));
const WhatsApp = lazy(() => import("@/pages/WhatsApp").then((m) => ({ default: m.WhatsApp })));
const PatchNotes = lazy(() => import("@/pages/PatchNotes").then((m) => ({ default: m.PatchNotes })));
const TerminalPage = lazy(() => import("@/pages/TerminalPage").then((m) => ({ default: m.TerminalPage })));

function PageView({ page }: { page: Page }) {
  switch (page) {
    case "inicio":
      return <Dashboard />;
    case "projetos":
      return <Projects />;
    case "terminal":
      return <TerminalPage />;
    case "tarefas":
      return <Tasks />;
    case "arquivos":
      return <FilesPage />;
    case "configuracoes":
      return <Settings />;
    case "ia":
      return <AICenter />;
    case "agenda":
      return <Agenda />;
    case "clientes":
      return <Clients />;
    case "marketing":
      return <Marketing />;
    case "whatsapp":
      return <WhatsApp />;
    case "integracoes":
      return <Integrations />;
    case "novidades":
      return <PatchNotes />;
  }
}

/** Páginas que ocupam a altura toda (sem padding/scroll do layout). */
const FULL_BLEED: Page[] = ["ia", "terminal"];

export function App() {
  const page = useUIStore((s) => s.page);
  const navigate = useUIStore((s) => s.navigate);
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);
  const quickTaskOpen = useUIStore((s) => s.quickTaskOpen);
  const setQuickTaskOpen = useUIStore((s) => s.setQuickTaskOpen);
  const setOnline = useUIStore((s) => s.setOnline);
  const { settings, load, loadSystem } = useSettingsStore();

  useEffect(() => {
    void load();
    void loadSystem();
  }, [load, loadSystem]);

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

  // Atalhos globais (dentro da janela). Customização futura: mapa em um só lugar.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (!e.shiftKey && key === "k") {
        e.preventDefault();
        setPaletteOpen(!useUIStore.getState().paletteOpen);
      } else if (e.shiftKey && key === "t") {
        e.preventDefault();
        setQuickTaskOpen(true);
      } else if (e.shiftKey && key === "p") {
        e.preventDefault();
        navigate("projetos");
      } else if (e.shiftKey && key === "a") {
        e.preventDefault();
        navigate("ia");
      }
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-text">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <UpdateBanner />
        <main className={fullBleed ? "min-h-0 flex-1 overflow-hidden" : "app-ambient flex-1 overflow-y-auto"}>
          <div key={page} className={fullBleed ? "h-full animate-fade-in" : "mx-auto max-w-[1400px] animate-fade-in px-7 py-6"}>
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
        </main>
      </div>

      <CommandPalette />
      <TaskFormDialog open={quickTaskOpen} onClose={() => setQuickTaskOpen(false)} />
      <ConfirmHost />
      <PromptHost />
      <WhatsNewDialog />
      <Toaster />
    </div>
  );
}
