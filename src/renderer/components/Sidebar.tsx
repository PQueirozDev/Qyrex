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
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useUIStore, type Page } from "@/stores/useUIStore";
import { SpotifyMiniPlayer } from "@/components/SpotifyMiniPlayer";

export const NAV_ITEMS: { id: Page; label: string; icon: LucideIcon; shortcut?: string }[] = [
  { id: "inicio", label: "Início", icon: Home },
  { id: "ia", label: "IA", icon: Bot, shortcut: "Ctrl Shift A" },
  { id: "projetos", label: "Projetos", icon: Code2, shortcut: "Ctrl Shift P" },
  { id: "terminal", label: "Terminal", icon: SquareTerminal },
  { id: "arquivos", label: "Arquivos", icon: FolderOpen },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "tarefas", label: "Tarefas", icon: CheckSquare },
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "marketing", label: "Marketing", icon: Megaphone },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
];

const FOOTER_ITEMS: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: "integracoes", label: "Integrações", icon: Plug },
  { id: "configuracoes", label: "Configurações", icon: SettingsIcon },
];

function NavButton({ item, active, onClick }: { item: { label: string; icon: LucideIcon; shortcut?: string }; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors",
        active ? "bg-bg-hover font-medium text-text" : "text-text-muted hover:bg-bg-hover/60 hover:text-text"
      )}
    >
      <Icon size={16} strokeWidth={active ? 2 : 1.75} className={active ? "text-accent" : "text-text-faint group-hover:text-text-muted"} />
      {item.label}
    </button>
  );
}

export function Sidebar() {
  const page = useUIStore((s) => s.page);
  const navigate = useUIStore((s) => s.navigate);

  return (
    <aside className="flex h-full w-[216px] shrink-0 flex-col border-r border-border-subtle bg-bg-elevated">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-hover text-[13px] font-bold text-accent-fg shadow-sm">
          PQ
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold text-text">PQueiroz</div>
          <div className="text-[11px] text-text-faint">Workspace</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1">
        {NAV_ITEMS.map((item) => (
          <NavButton key={item.id} item={item} active={page === item.id} onClick={() => navigate(item.id)} />
        ))}
        <div className="!my-2 mx-2 h-px bg-border-subtle" />
        {FOOTER_ITEMS.map((item) => (
          <NavButton key={item.id} item={item} active={page === item.id} onClick={() => navigate(item.id)} />
        ))}
      </nav>

      <SpotifyMiniPlayer />
    </aside>
  );
}
