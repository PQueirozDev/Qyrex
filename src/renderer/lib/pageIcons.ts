import {
  Bot,
  CalendarDays,
  CheckSquare,
  Code2,
  FolderOpen,
  Home,
  Megaphone,
  MessageCircle,
  NotebookPen,
  Plug,
  Settings,
  Sparkles,
  SquareTerminal,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Page } from "@/stores/useUIStore";

/** Ícone de cada área: o mesmo na barra lateral, no cabeçalho da página e na paleta. */
export const PAGE_ICONS: Record<Page, LucideIcon> = {
  inicio: Home,
  ia: Bot,
  projetos: Code2,
  terminal: SquareTerminal,
  arquivos: FolderOpen,
  tarefas: CheckSquare,
  agenda: CalendarDays,
  notion: NotebookPen,
  clientes: Users,
  marketing: Megaphone,
  whatsapp: MessageCircle,
  novidades: Sparkles,
  integracoes: Plug,
  configuracoes: Settings,
};
