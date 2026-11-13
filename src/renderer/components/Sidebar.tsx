import { PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { tr } from "@/lib/i18n";
import { PAGE_ICONS } from "@/lib/pageIcons";
import { useUIStore, type Page } from "@/stores/useUIStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { MiniPlayer } from "@/components/MiniPlayer";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { CHANGELOG, compareVersions } from "@shared/changelog";
import logoUrl from "@/assets/logo.svg";

interface NavItem {
  id: Page;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
}

const item = (id: Page, label: string, shortcut?: string): NavItem => ({ id, label, icon: PAGE_ICONS[id], shortcut });

// Grupos por momento de uso: organizar o dia, desenvolver, ferramentas de apoio.
const SECTIONS: { title: string | null; items: NavItem[] }[] = [
  {
    title: null,
    items: [item("inicio", tr("Início")), item("projetos", tr("Projetos"), "Ctrl Shift P"), item("tarefas", tr("Tarefas")), item("agenda", tr("Agenda"))],
  },
  {
    title: tr("Desenvolvimento"),
    items: [
      item("workspace", tr("Workspace")),
      item("terminal", tr("Terminal")),
      item("editor", tr("Editor")),
      item("preview", tr("Preview")),
      item("processos", tr("Processos")),
      item("arquivos", tr("Arquivos")),
    ],
  },
  {
    title: tr("Ferramentas"),
    items: [
      item("ia", tr("IA"), "Ctrl Shift A"),
      item("automacoes", tr("Automações")),
      item("ferramentas", tr("Utilitários")),
      item("plugins", tr("Plugins")),
      item("notion", tr("Notion")),
    ],
  },
];

const FOOTER_ITEMS: NavItem[] = [item("novidades", tr("Novidades")), item("integracoes", tr("Integrações")), item("configuracoes", tr("Configurações"))];

/** Todos os destinos navegáveis (usado pela Command Palette). */
export const NAV_ITEMS: NavItem[] = [...SECTIONS.flatMap((s) => s.items), ...FOOTER_ITEMS];

// Mola da pílula ativa: rápida, com um leve assentamento no fim.
const PILL_SPRING = { type: "spring", stiffness: 520, damping: 40, mass: 0.7 } as const;

function NavButton({
  item,
  active,
  badge,
  collapsed,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  badge?: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "press group relative flex w-full items-center gap-2.5 rounded-lg py-[5px] text-[13px] transition-colors",
        collapsed ? "justify-center px-0" : "px-2.5",
        active ? "font-medium text-text" : "text-text-muted hover:bg-bg-hover/60 hover:text-text"
      )}
    >
      {/* A pílula desliza de um item para o outro ao navegar (layoutId compartilhado). */}
      {active && (
        <motion.span layoutId="sidebar-active" transition={PILL_SPRING} className="absolute inset-0 rounded-lg border border-border-subtle bg-bg-hover shadow-card">
          <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent shadow-[0_0_10px_rgb(var(--accent)/0.8)]" />
        </motion.span>
      )}
      <Icon
        size={16}
        strokeWidth={active ? 2 : 1.75}
        className={cn("relative transition-colors", active ? "text-accent" : "text-text-faint group-hover:text-text-muted")}
      />
      {!collapsed && <span className="relative flex-1 text-left">{item.label}</span>}
      {badge && (
        <span className={cn("flex h-2 w-2", collapsed ? "absolute right-2 top-1.5" : "relative")} aria-label={tr("Novidades não lidas")}>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
      )}
    </button>
  );
}

export function Sidebar() {
  const page = useUIStore((s) => s.page);
  const online = useUIStore((s) => s.online);
  const navigate = useUIStore((s) => s.navigate);
  const settings = useSettingsStore((s) => s.settings);
  const system = useSettingsStore((s) => s.system);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const setCollapsed = useUIStore((s) => s.setSidebarCollapsed);

  const latest = CHANGELOG[0]?.version;
  const unreadNews = Boolean(latest && settings && (!settings.lastSeenVersion || compareVersions(settings.lastSeenVersion, latest) < 0));

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border-subtle bg-bg-elevated transition-[width] duration-200",
        collapsed ? "w-[60px]" : "w-[224px]"
      )}
    >
      <div className={cn("drag-region flex items-center gap-2.5 pb-2 pt-4", collapsed ? "flex-col px-2" : "px-4")}>
        <img src={logoUrl} alt="" className="h-8 w-8 shrink-0 [image-rendering:pixelated] drop-shadow-[0_4px_10px_rgb(255_154_60/0.25)]" draggable={false} />
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[14px] font-semibold tracking-tight text-text">Qyrex</div>
            <div className="text-[11px] text-text-faint">{system ? `v${system.appVersion}` : tr("Central de trabalho")}</div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="press rounded-md p-1 text-text-faint transition-colors hover:bg-bg-hover hover:text-text"
          title={collapsed ? tr("Expandir barra lateral") : tr("Recolher barra lateral")}
          aria-label={collapsed ? tr("Expandir barra lateral") : tr("Recolher barra lateral")}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {SECTIONS.map((section, i) => (
          <div key={i} className="space-y-0.5">
            {section.title && !collapsed ? <div className="nav-label">{section.title}</div> : <div className={collapsed && section.title ? "mx-3 my-2 h-px bg-border-subtle" : "h-2"} />}
            {section.items.map((item) => (
              <NavButton key={item.id} item={item} collapsed={collapsed} active={page === item.id} onClick={() => navigate(item.id)} />
            ))}
          </div>
        ))}
        {collapsed ? <div className="mx-3 my-2 h-px bg-border-subtle" /> : <div className="nav-label">{tr("Sistema")}</div>}
        <div className="space-y-0.5">
          {FOOTER_ITEMS.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={page === item.id}
              badge={item.id === "novidades" && unreadNews}
              collapsed={collapsed}
              onClick={() => navigate(item.id)}
            />
          ))}
        </div>
      </nav>

      <button
        onClick={() => navigate("configuracoes")}
        className={cn("press mx-2 mb-2 flex items-center gap-2.5 rounded-lg py-2 text-left transition-colors hover:bg-bg-hover", collapsed ? "justify-center px-0" : "px-2")}
        title={tr("Configurações")}
      >
        <ProfileAvatar size={28}>
          <span
            className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-bg-elevated", online ? "bg-success" : "bg-text-faint")}
          />
        </ProfileAvatar>
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium text-text">{settings?.userName || tr("Você")}</span>
            <span className="block text-[11px] text-text-faint">{online ? tr("Online") : tr("Offline")}</span>
          </span>
        )}
      </button>

      {/* Recolhida, a barra não tem largura para o player; a música continua na barra de status. */}
      {!collapsed && <MiniPlayer />}
    </aside>
  );
}
