/**
 * Layout do Workspace: uma árvore de divisões (linha/coluna, com tamanhos em
 * frações) cujas folhas são grupos de abas. Cada painel aparece no máximo uma
 * vez por projeto. Tudo aqui é puro (sem React), para ser testado e salvo como JSON.
 */

export const PANEL_IDS = ["files", "terminal", "git", "preview", "ai", "tasks", "notes", "processes", "monitor"] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export interface GroupNode {
  kind: "group";
  id: string;
  tabs: PanelId[];
  active: PanelId;
}
export interface SplitNode {
  kind: "split";
  id: string;
  /** row: lado a lado; col: um em cima do outro. */
  dir: "row" | "col";
  /** Frações (somam 1), uma por filho. */
  sizes: number[];
  children: LayoutNode[];
}
export type LayoutNode = GroupNode | SplitNode;
export type Edge = "center" | "left" | "right" | "top" | "bottom";
export type PresetId = "dev" | "debug" | "git" | "focus";

let seq = 0;
const nid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const group = (tabs: PanelId[], active: PanelId = tabs[0]): GroupNode => ({ kind: "group", id: nid("g"), tabs, active });
export const split = (dir: "row" | "col", children: LayoutNode[], sizes?: number[]): SplitNode => ({
  kind: "split",
  id: nid("s"),
  dir,
  children,
  sizes: sizes ?? children.map(() => 1 / children.length),
});

/** Layouts prontos (os do prompt): Desenvolvimento, Debug, Git e Foco. */
export function preset(id: PresetId): LayoutNode {
  switch (id) {
    case "dev":
      return split("row", [group(["files", "tasks", "notes"]), split("col", [group(["preview", "git"]), group(["terminal", "processes"])], [0.62, 0.38])], [0.22, 0.78]);
    case "debug":
      return split("row", [split("col", [group(["terminal"]), group(["processes", "preview"])], [0.55, 0.45]), group(["monitor", "ai"])], [0.6, 0.4]);
    case "git":
      return split("row", [group(["git"]), split("col", [group(["files", "notes"]), group(["terminal"])], [0.5, 0.5])], [0.55, 0.45]);
    case "focus":
      return group(["terminal", "files", "notes"]);
  }
}

export function panelsIn(node: LayoutNode): PanelId[] {
  return node.kind === "group" ? [...node.tabs] : node.children.flatMap(panelsIn);
}

export function findGroup(node: LayoutNode, id: string): GroupNode | null {
  if (node.kind === "group") return node.id === id ? node : null;
  for (const c of node.children) {
    const g = findGroup(c, id);
    if (g) return g;
  }
  return null;
}

export function firstGroup(node: LayoutNode): GroupNode {
  return node.kind === "group" ? node : firstGroup(node.children[0]);
}

/** Tira grupos vazios, desfaz divisões de um filho só e junta divisões na mesma direção. */
export function normalize(node: LayoutNode): LayoutNode | null {
  if (node.kind === "group") {
    if (node.tabs.length === 0) return null;
    return node.tabs.includes(node.active) ? node : { ...node, active: node.tabs[0] };
  }
  const kids: LayoutNode[] = [];
  const sizes: number[] = [];
  node.children.forEach((c, i) => {
    const n = normalize(c);
    if (!n) return;
    if (n.kind === "split" && n.dir === node.dir) {
      n.children.forEach((cc, j) => {
        kids.push(cc);
        sizes.push(node.sizes[i] * n.sizes[j]);
      });
    } else {
      kids.push(n);
      sizes.push(node.sizes[i] ?? 0);
    }
  });
  if (kids.length === 0) return null;
  if (kids.length === 1) return kids[0];
  const total = sizes.reduce((a, b) => a + b, 0) || 1;
  return { ...node, children: kids, sizes: sizes.map((s) => s / total) };
}

function mapGroups(node: LayoutNode, fn: (g: GroupNode) => LayoutNode): LayoutNode {
  return node.kind === "group" ? fn(node) : { ...node, children: node.children.map((c) => mapGroups(c, fn)) };
}

export function setActive(root: LayoutNode, groupId: string, panel: PanelId): LayoutNode {
  return mapGroups(root, (g) => (g.id === groupId && g.tabs.includes(panel) ? { ...g, active: panel } : g));
}

function removePanel(root: LayoutNode, panel: PanelId): LayoutNode | null {
  return normalize(mapGroups(root, (g) => ({ ...g, tabs: g.tabs.filter((t) => t !== panel) })));
}

export function closePanel(root: LayoutNode, panel: PanelId): LayoutNode | null {
  return removePanel(root, panel);
}

/** Abre um painel: se já está no layout, só ativa; senão entra no grupo indicado (ou no primeiro). */
export function openPanel(root: LayoutNode | null, panel: PanelId, groupId?: string): LayoutNode {
  if (!root) return group([panel]);
  const existing = findGroupWith(root, panel);
  if (existing) return setActive(root, existing.id, panel);
  const target = (groupId && findGroup(root, groupId)) || firstGroup(root);
  return mapGroups(root, (g) => (g.id === target.id ? { ...g, tabs: [...g.tabs, panel], active: panel } : g));
}

export function findGroupWith(node: LayoutNode, panel: PanelId): GroupNode | null {
  if (node.kind === "group") return node.tabs.includes(panel) ? node : null;
  for (const c of node.children) {
    const g = findGroupWith(c, panel);
    if (g) return g;
  }
  return null;
}

/**
 * Move um painel para outro grupo. `center` junta às abas do grupo; as bordas
 * dividem o grupo de destino e põem o painel do lado escolhido.
 */
export function movePanel(root: LayoutNode, panel: PanelId, targetGroupId: string, edge: Edge): LayoutNode {
  const from = findGroupWith(root, panel);
  const target = findGroup(root, targetGroupId);
  if (!from || !target) return root;
  if (edge === "center") {
    if (from.id === target.id) return setActive(root, target.id, panel);
    const without = mapGroups(root, (g) => (g.id === from.id ? { ...g, tabs: g.tabs.filter((t) => t !== panel) } : g));
    const added = mapGroups(without, (g) => (g.id === target.id ? { ...g, tabs: [...g.tabs, panel], active: panel } : g));
    return normalize(added) ?? group([panel]);
  }
  // Dividir o próprio grupo com uma aba só não muda nada.
  if (from.id === target.id && from.tabs.length === 1) return root;
  const dir: "row" | "col" = edge === "left" || edge === "right" ? "row" : "col";
  const moved = group([panel]);
  const without = mapGroups(root, (g) => (g.id === from.id ? { ...g, tabs: g.tabs.filter((t) => t !== panel) } : g));
  const placed = mapGroups(without, (g) => {
    if (g.id !== target.id) return g;
    const kids = edge === "left" || edge === "top" ? [moved, g] : [g, moved];
    return split(dir, kids);
  });
  return normalize(placed) ?? moved;
}

/** Divide um grupo: a aba ativa vai para um grupo novo ao lado (direita ou embaixo). */
export function splitGroup(root: LayoutNode, groupId: string, dir: "row" | "col"): LayoutNode {
  const g = findGroup(root, groupId);
  if (!g || g.tabs.length < 2) return root;
  return movePanel(root, g.active, groupId, dir === "row" ? "right" : "bottom");
}

export function resizeSplit(root: LayoutNode, splitId: string, sizes: number[]): LayoutNode {
  if (root.kind === "group") return root;
  if (root.id === splitId && sizes.length === root.children.length) {
    const clamped = sizes.map((s) => Math.max(0.08, s));
    const total = clamped.reduce((a, b) => a + b, 0);
    return { ...root, sizes: clamped.map((s) => s / total) };
  }
  return { ...root, children: root.children.map((c) => resizeSplit(c, splitId, sizes)) };
}

/**
 * Lê um layout salvo (localStorage). Qualquer coisa estranha (painel que não existe
 * mais, repetido, tamanhos inválidos) é limpa; se nada sobrar, devolve null.
 */
export function sanitize(raw: unknown, seen = new Set<PanelId>()): LayoutNode | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as { kind?: unknown; id?: unknown; tabs?: unknown[]; active?: unknown; dir?: unknown; sizes?: unknown[]; children?: unknown[] };
  if (n.kind === "group" && Array.isArray(n.tabs)) {
    const tabs: PanelId[] = [];
    for (const t of n.tabs) {
      if (!(PANEL_IDS as readonly string[]).includes(t as string) || seen.has(t as PanelId)) continue;
      seen.add(t as PanelId);
      tabs.push(t as PanelId);
    }
    if (tabs.length === 0) return null;
    return { kind: "group", id: typeof n.id === "string" ? n.id : nid("g"), tabs, active: tabs.includes(n.active as PanelId) ? (n.active as PanelId) : tabs[0] };
  }
  if (n.kind === "split" && (n.dir === "row" || n.dir === "col") && Array.isArray(n.children)) {
    const valid = Array.isArray(n.sizes) && n.sizes.length === n.children.length && n.sizes.every((s) => typeof s === "number" && s > 0);
    const sizes = valid ? (n.sizes as number[]) : n.children.map(() => 1);
    const kids: LayoutNode[] = [];
    const kidSizes: number[] = [];
    n.children.forEach((c, i) => {
      const k = sanitize(c, seen);
      if (k) {
        kids.push(k);
        kidSizes.push(sizes[i]);
      }
    });
    return normalize({ kind: "split", id: typeof n.id === "string" ? n.id : nid("s"), dir: n.dir, children: kids, sizes: kidSizes });
  }
  return null;
}
