import { useRef, useState, type CSSProperties } from "react";
import { Columns2, Maximize2, Minimize2, Plus, Rows2, X } from "lucide-react";
import type { ProjectWithGit } from "@shared/types";
import { Menu } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { tr } from "@/lib/i18n";
import { PANEL_IDS, panelsIn, type Edge, type GroupNode, type LayoutNode, type PanelId } from "@/lib/workspaceLayout";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import { usePluginsStore } from "@/stores/usePluginsStore";
import { PANEL_META, PanelContent } from "./panels";

/** Painel sendo arrastado (o dataTransfer não é legível no dragover). */
let dragging: PanelId | null = null;
const DRAG_TYPE = "application/x-qyrex-panel";

function edgeAt(e: React.DragEvent, el: HTMLElement): Edge {
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  if (x < 0.22) return "left";
  if (x > 0.78) return "right";
  if (y < 0.22) return "top";
  if (y > 0.78) return "bottom";
  return "center";
}

const EDGE_STYLE: Record<Edge, string> = {
  center: "inset-1",
  left: "inset-y-1 left-1 w-1/2",
  right: "inset-y-1 right-1 w-1/2",
  top: "inset-x-1 top-1 h-1/2",
  bottom: "inset-x-1 bottom-1 h-1/2",
};

interface Ctx {
  project: ProjectWithGit;
  visible: boolean;
  maximized: string | null;
  allPanels: PanelId[];
}

function Group({ node, ctx }: { node: GroupNode; ctx: Ctx }) {
  const { activate, close, move, split, toggleMaximize, openPanel } = useWorkspaceStore();
  const pid = ctx.project.id;
  const bodyRef = useRef<HTMLDivElement>(null);
  const [drop, setDrop] = useState<Edge | null>(null);
  const isMax = ctx.maximized === node.id;
  const hiddenByMax = ctx.maximized !== null && !isMax;
  const notesOn = usePluginsStore((s) => s.isActive("notes"));
  // Painel de notas só é oferecido com o plugin ligado.
  const missing = PANEL_IDS.filter((p) => !ctx.allPanels.includes(p) && (p !== "notes" || notesOn));

  const onDrop = (e: React.DragEvent, edge: Edge) => {
    e.preventDefault();
    setDrop(null);
    const panel = (e.dataTransfer.getData(DRAG_TYPE) || dragging) as PanelId | null;
    dragging = null;
    if (panel && (PANEL_IDS as readonly string[]).includes(panel)) move(pid, panel, node.id, edge);
  };

  return (
    <section
      className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border-subtle bg-bg-card/40", isMax && "absolute inset-0 z-10 bg-bg")}
      aria-label={PANEL_META[node.active].label}
    >
      <div
        className="flex h-8 shrink-0 items-center gap-0.5 border-b border-border-subtle bg-bg-elevated/70 pl-1 pr-1"
        onDragOver={(e) => {
          if (!dragging) return;
          e.preventDefault();
          setDrop("center");
        }}
        onDragLeave={() => setDrop(null)}
        onDrop={(e) => onDrop(e, "center")}
        role="tablist"
      >
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {node.tabs.map((t) => {
            const Icon = PANEL_META[t].icon;
            const active = t === node.active;
            return (
              <div
                key={t}
                role="tab"
                aria-selected={active}
                tabIndex={0}
                draggable
                onDragStart={(e) => {
                  dragging = t;
                  e.dataTransfer.setData(DRAG_TYPE, t);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  dragging = null;
                  setDrop(null);
                }}
                onClick={() => activate(pid, node.id, t)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && activate(pid, node.id, t)}
                onAuxClick={(e) => e.button === 1 && close(pid, t)}
                className={cn(
                  "group/tab flex h-6 shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors",
                  active ? "bg-bg-hover text-text" : "text-text-faint hover:text-text"
                )}
                title={tr("Arraste para mover ou dividir")}
              >
                <Icon size={12} className={active ? "text-accent" : ""} />
                {PANEL_META[t].label}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    close(pid, t);
                  }}
                  className="rounded p-px opacity-0 hover:bg-bg focus-visible:opacity-100 group-hover/tab:opacity-100"
                  aria-label={tr("Fechar {name}", { name: PANEL_META[t].label })}
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
        {missing.length > 0 && (
          <Menu
            label={tr("Adicionar painel")}
            trigger={<Plus size={13} />}
            items={missing.map((p) => ({ label: PANEL_META[p].label, icon: PANEL_META[p].icon, onSelect: () => openPanel(pid, p, node.id) }))}
          />
        )}
        {node.tabs.length > 1 && (
          <>
            <button onClick={() => split(pid, node.id, "row")} className="rounded-md p-1 text-text-faint hover:bg-bg-hover hover:text-text" aria-label={tr("Dividir para o lado")} title={tr("Dividir para o lado")}>
              <Columns2 size={13} />
            </button>
            <button onClick={() => split(pid, node.id, "col")} className="rounded-md p-1 text-text-faint hover:bg-bg-hover hover:text-text" aria-label={tr("Dividir para baixo")} title={tr("Dividir para baixo")}>
              <Rows2 size={13} />
            </button>
          </>
        )}
        <button
          onClick={() => toggleMaximize(pid, node.id)}
          className="rounded-md p-1 text-text-faint hover:bg-bg-hover hover:text-text"
          aria-label={isMax ? tr("Restaurar") : tr("Maximizar")}
          title={isMax ? tr("Restaurar") : tr("Maximizar")}
        >
          {isMax ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>
      <div
        ref={bodyRef}
        className="relative min-h-0 flex-1"
        onDragOver={(e) => {
          if (!dragging || !bodyRef.current) return;
          e.preventDefault();
          setDrop(edgeAt(e, bodyRef.current));
        }}
        onDragLeave={(e) => {
          if (!bodyRef.current?.contains(e.relatedTarget as Node)) setDrop(null);
        }}
        onDrop={(e) => bodyRef.current && onDrop(e, edgeAt(e, bodyRef.current))}
      >
        {/* Todas as abas ficam montadas (o terminal não reinicia ao trocar de aba); só a ativa aparece. */}
        {node.tabs.map((t) => (
          <div key={t} className={cn("absolute inset-0", t === node.active ? "block" : "hidden")}>
            <PanelContent panel={t} project={ctx.project} visible={ctx.visible && t === node.active && !hiddenByMax} />
          </div>
        ))}
        {drop && <div className={cn("pointer-events-none absolute z-20 rounded-md border-2 border-accent/70 bg-accent/10", EDGE_STYLE[drop])} />}
      </div>
    </section>
  );
}

function Split({ node, ctx }: { node: Extract<LayoutNode, { kind: "split" }>; ctx: Ctx }) {
  const resize = useWorkspaceStore((s) => s.resize);
  const boxRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<number[] | null>(null);
  const sizes = live ?? node.sizes;
  const row = node.dir === "row";

  const startDrag = (index: number, e: React.PointerEvent) => {
    const box = boxRef.current;
    if (!box) return;
    e.preventDefault();
    const total = row ? box.clientWidth : box.clientHeight;
    const start = row ? e.clientX : e.clientY;
    const initial = [...node.sizes];
    let current = initial;
    const onMove = (ev: PointerEvent) => {
      const delta = ((row ? ev.clientX : ev.clientY) - start) / total;
      const a = Math.max(0.08, initial[index] + delta);
      const b = Math.max(0.08, initial[index] + initial[index + 1] - a);
      current = initial.map((s, i) => (i === index ? initial[index] + initial[index + 1] - b : i === index + 1 ? b : s));
      setLive(current);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      setLive(null);
      resize(ctx.project.id, node.id, current);
    };
    document.body.style.cursor = row ? "col-resize" : "row-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div ref={boxRef} className={cn("flex min-h-0 min-w-0 flex-1", row ? "flex-row" : "flex-col")}>
      {node.children.map((child, i) => (
        <div key={child.id} className="contents">
          <div className="flex min-h-0 min-w-0" style={{ flex: `${sizes[i]} 1 0px` } as CSSProperties}>
            <Node node={child} ctx={ctx} />
          </div>
          {i < node.children.length - 1 && (
            <div
              role="separator"
              aria-orientation={row ? "vertical" : "horizontal"}
              tabIndex={0}
              onPointerDown={(e) => startDrag(i, e)}
              onKeyDown={(e) => {
                const step = e.key === (row ? "ArrowRight" : "ArrowDown") ? 0.03 : e.key === (row ? "ArrowLeft" : "ArrowUp") ? -0.03 : 0;
                if (!step) return;
                e.preventDefault();
                const next = [...node.sizes];
                next[i] += step;
                next[i + 1] -= step;
                if (next[i] > 0.08 && next[i + 1] > 0.08) resize(ctx.project.id, node.id, next);
              }}
              className={cn("group/sep relative shrink-0 focus-visible:outline-none", row ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize")}
              aria-label={tr("Redimensionar")}
            >
              <span className={cn("absolute rounded-full bg-transparent transition-colors group-hover/sep:bg-accent/60 group-focus-visible/sep:bg-accent", row ? "inset-y-2 left-1/2 w-0.5 -translate-x-1/2" : "inset-x-2 top-1/2 h-0.5 -translate-y-1/2")} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Node({ node, ctx }: { node: LayoutNode; ctx: Ctx }) {
  return node.kind === "group" ? <Group node={node} ctx={ctx} /> : <Split node={node} ctx={ctx} />;
}

export function WorkspaceLayout({ layout, project, visible }: { layout: LayoutNode; project: ProjectWithGit; visible: boolean }) {
  const maximized = useWorkspaceStore((s) => s.maximized[project.id] ?? null);
  const ctx: Ctx = { project, visible, maximized, allPanels: panelsIn(layout) };
  return (
    <div className="relative flex min-h-0 flex-1 p-1.5">
      <Node node={layout} ctx={ctx} />
    </div>
  );
}
