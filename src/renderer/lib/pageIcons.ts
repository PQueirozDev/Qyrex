import {
  Bot,
  CalendarDays,
  CheckSquare,
  Code2,
  FileCode2,
  FolderOpen,
  Home,
  Activity,
  Wrench,
  NotebookPen,
  Plug,
  Settings,
  Sparkles,
  SquareTerminal,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { Page } from "@/stores/useUIStore";

/** Ícone de cada área: o mesmo na barra lateral, no cabeçalho da página e na paleta. */
export const PAGE_ICONS: Record<Page, LucideIcon> = {
  inicio: Home,
  ia: Bot,
  projetos: Code2,
  terminal: SquareTerminal,
  automacoes: Workflow,
  processos: Activity,
  ferramentas: Wrench,
  arquivos: FolderOpen,
  editor: FileCode2,
  tarefas: CheckSquare,
  agenda: CalendarDays,
  notion: NotebookPen,
  novidades: Sparkles,
  integracoes: Plug,
  configuracoes: Settings,
};
