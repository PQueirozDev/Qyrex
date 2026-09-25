import {
  Home,
  Bot,
  Code2,
  SquareTerminal,
  FolderOpen,
  CalendarDays,
  CheckSquare,
  Users,
  Megaphone,
  MessageCircle,
  Plug,
  Sparkles,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { tr } from "@/lib/i18n";
import { useUIStore, type Page } from "@/stores/useUIStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { MiniPlayer } from "@/components/MiniPlayer";
import { CHANGELOG } from "@shared/changelog";

interface NavItem {
  id: Page;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
}

const SECTIONS: { title: string | null; items: NavItem[] }[] = [
  {
    title: null,
    items: [
      { id: "inicio", label: tr("Início"), icon: Home },
      { id: "ia", label: tr("IA"), icon: Bot, shortcut: "Ctrl Shift A" },
    ],
  },
  {
    title: tr("Trabalho"),
    items: [
      { id: "projetos", label: tr("Projetos"), icon: Code2, shortcut: "Ctrl Shift P" },
      { id: "terminal", label: tr("Terminal"), icon: SquareTerminal },
      { id: "arquivos", label: tr("Arquivos"), icon: FolderOpen },
      { id: "tarefas", label: tr("Tarefas"), icon: CheckSquare },
      { id: "agenda", label: tr("Agenda"), icon: CalendarDays },
    ],
  },
  {
    title: tr("Negócio"),
    items: [
      { id: "clientes", label: tr("Clientes"), icon: Users },
      { id: "marketing", label: tr("Marketing"), icon: Megaphone },
      { id: "whatsapp", label: tr("WhatsApp"), icon: MessageCircle },
    ],
  },
];

const FOOTER_ITEMS: NavItem[] = [
  { id: "novidades", label: tr("Novidades"), icon: Sparkles },
  { id: "integracoes", label: tr("Integrações"), icon: Plug },
  { id: "configuracoes", label: tr("Configurações"), icon: SettingsIcon },
];

/** Todos os destinos navegáveis (usado pela Command Palette). */
export const NAV_ITEMS: NavItem[] = [...SECTIONS.flatMap((s) => s.items), ...FOOTER_ITEMS];

function NavButton({ item, active, badge, onClick }: { item: NavItem; active: boolean; badge?: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
      className={cn(
        "group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors",
        active ? "bg-bg-hover font-medium text-text" : "text-text-muted hover:bg-bg-hover/60 hover:text-text"
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent transition-opacity",
          active ? "opacity-100" : "opacity-0"
        )}
      />
      <Icon size={16} strokeWidth={active ? 2 : 1.75} className={active ? "text-accent" : "text-text-faint group-hover:text-text-muted"} />
      <span className="flex-1 text-left">{item.label}</span>
      {badge && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label={tr("Novidades não lidas")} />}
    </button>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Q";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Sidebar() {
  const page = useUIStore((s) => s.page);
  const online = useUIStore((s) => s.online);
  const navigate = useUIStore((s) => s.navigate);
  const settings = useSettingsStore((s) => s.settings);
  const system = useSettingsStore((s) => s.system);

  const latest = CHANGELOG[0]?.version;
  const unreadNews = Boolean(latest && settings && settings.lastSeenVersion !== latest);

  return (
    <aside className="flex h-full w-[224px] shrink-0 flex-col border-r border-border-subtle bg-bg-elevated">
      <div className="drag-region flex items-center gap-2.5 px-4 pb-2 pt-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-accent to-accent-hover text-[15px] font-bold text-accent-fg shadow-sm ring-1 ring-inset ring-white/10">
          Q
        </div>
        <div className="min-w-0 leading-tight">
          <div className="text-[14px] font-semibold tracking-tight text-text">QrzSpace</div>
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
        className="mx-2 mb-2 flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-bg-hover"
        title={tr("Configurações")}
      >
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
          {initials(settings?.userName ?? "")}
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
