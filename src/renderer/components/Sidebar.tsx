import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { PAGE_ICONS } from "@/lib/pageIcons";
import { useUIStore, type Page } from "@/stores/useUIStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { MiniPlayer } from "@/components/MiniPlayer";
import { CHANGELOG, compareVersions } from "@shared/changelog";
import logoUrl from "@/assets/logo.svg";

interface NavItem {
  id: Page;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
}

const item = (id: Page, label: string, shortcut?: string): NavItem => ({ id, label, icon: PAGE_ICONS[id], shortcut });

const SECTIONS: { title: string | null; items: NavItem[] }[] = [
  {
    title: null,
    items: [item("inicio", tr("Início")), item("ia", tr("IA"), "Ctrl Shift A")],
  },
  {
    title: tr("Trabalho"),
    items: [
      item("projetos", tr("Projetos"), "Ctrl Shift P"),
      item("terminal", tr("Terminal")),
      item("arquivos", tr("Arquivos")),
      item("tarefas", tr("Tarefas")),
      item("agenda", tr("Agenda")),
      item("notion", tr("Notion")),
    ],
  },
  {
    title: tr("Negócio"),
    items: [item("clientes", tr("Clientes")), item("marketing", tr("Marketing")), item("whatsapp", tr("WhatsApp"))],
  },
];

const FOOTER_ITEMS: NavItem[] = [item("novidades", tr("Novidades")), item("integracoes", tr("Integrações")), item("configuracoes", tr("Configurações"))];

/** Todos os destinos navegáveis (usado pela Command Palette). */
export const NAV_ITEMS: NavItem[] = [...SECTIONS.flatMap((s) => s.items), ...FOOTER_ITEMS];

// Mola da pílula ativa: rápida, com um leve assentamento no fim.
const PILL_SPRING = { type: "spring", stiffness: 520, damping: 40, mass: 0.7 } as const;

function NavButton({ item, active, badge, onClick }: { item: NavItem; active: boolean; badge?: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "press group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors",
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
      <span className="relative flex-1 text-left">{item.label}</span>
      {badge && (
        <span className="relative flex h-2 w-2" aria-label={tr("Novidades não lidas")}>
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

  const latest = CHANGELOG[0]?.version;
  const unreadNews = Boolean(latest && settings && (!settings.lastSeenVersion || compareVersions(settings.lastSeenVersion, latest) < 0));

  return (
    <aside className="flex h-full w-[224px] shrink-0 flex-col border-r border-border-subtle bg-bg-elevated">
      <div className="drag-region flex items-center gap-2.5 px-4 pb-2 pt-4">
        <img src={logoUrl} alt="" className="h-8 w-8 shrink-0 [image-rendering:pixelated] drop-shadow-[0_4px_10px_rgb(255_154_60/0.25)]" draggable={false} />
        <div className="min-w-0 leading-tight">
          <div className="text-[14px] font-semibold tracking-tight text-text">Qyrex</div>
          <div className="text-[11px] text-text-faint">{system ? `v${system.appVersion}` : tr("Central de trabalho")}</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {SECTIONS.map((section, i) => (
          <div key={i} className="space-y-0.5">
            {section.title ? <div className="nav-label">{section.title}</div> : <div className="h-2" />}
            {section.items.map((item) => (
              <NavButton key={item.id} item={item} active={page === item.id} onClick={() => navigate(item.id)} />
            ))}
          </div>
        ))}
        <div className="nav-label">{tr("Sistema")}</div>
        <div className="space-y-0.5">
          {FOOTER_ITEMS.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={page === item.id}
              badge={item.id === "novidades" && unreadNews}
              onClick={() => navigate(item.id)}
            />
          ))}
        </div>
      </nav>

      <button
        onClick={() => navigate("configuracoes")}
        className="press mx-2 mb-2 flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-bg-hover"
        title={tr("Configurações")}
      >
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/30 to-accent/10 text-[11px] font-semibold text-accent ring-1 ring-accent/25">
          {initials(settings?.userName ?? "", "Q")}
          <span
            className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-bg-elevated", online ? "bg-success" : "bg-text-faint")}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium text-text">{settings?.userName || tr("Você")}</span>
          <span className="block text-[11px] text-text-faint">{online ? tr("Online") : tr("Offline")}</span>
        </span>
      </button>

      <MiniPlayer />
    </aside>
  );
}
