import { describe, expect, it } from "vitest";
import {
  closePanel,
  findGroupWith,
  group,
  movePanel,
  normalize,
  openPanel,
  panelsIn,
  preset,
  resizeSplit,
  sanitize,
  split,
  splitGroup,
  type LayoutNode,
  type SplitNode,
} from "../../src/renderer/lib/workspaceLayout";

const shape = (n: LayoutNode | null): unknown =>
  !n ? null : n.kind === "group" ? n.tabs.join("+") : { [n.dir]: n.children.map(shape) };

describe("workspace: presets", () => {
  it("cada preset usa cada painel no máximo uma vez", () => {
    for (const id of ["dev", "debug", "git", "focus"] as const) {
      const panels = panelsIn(preset(id));
      expect(new Set(panels).size, id).toBe(panels.length);
    }
  });
});

describe("workspace: operações", () => {
  it("abrir um painel já presente só ativa; um novo entra no primeiro grupo", () => {
    const base = split("row", [group(["files"]), group(["terminal", "git"], "terminal")]);
    const activated = openPanel(base, "git");
    expect(findGroupWith(activated, "git")?.active).toBe("git");
    expect(panelsIn(activated)).toHaveLength(3);
    const added = openPanel(base, "notes");
    expect(shape(added)).toEqual({ row: ["files+notes", "terminal+git"] });
  });

  it("fechar a última aba some com o grupo e desfaz a divisão", () => {
    const base = split("row", [group(["files"]), group(["terminal"])]);
    expect(shape(closePanel(base, "files"))).toBe("terminal");
    expect(closePanel(group(["files"]), "files")).toBeNull();
  });

  it("mover para o centro junta as abas; para a borda divide o destino", () => {
    const a = group(["files", "notes"]);
    const b = group(["terminal"]);
    const base = split("row", [a, b]);
    expect(shape(movePanel(base, "notes", b.id, "center"))).toEqual({ row: ["files", "terminal+notes"] });
    expect(shape(movePanel(base, "notes", b.id, "bottom"))).toEqual({ row: ["files", { col: ["terminal", "notes"] }] });
    // Mesma direção da divisão pai: vira irmão, sem divisão aninhada.
    expect(shape(movePanel(base, "notes", b.id, "right"))).toEqual({ row: ["files", "terminal", "notes"] });
  });

  it("dividir manda a aba ativa para um grupo novo", () => {
    const g = group(["files", "git"], "git");
    expect(shape(splitGroup(g, g.id, "col"))).toEqual({ col: ["files", "git"] });
    const single = group(["files"]);
    expect(splitGroup(single, single.id, "row")).toBe(single);
  });

  it("redimensionar respeita o mínimo e mantém a soma 1", () => {
    const s = split("row", [group(["files"]), group(["git"])]);
    const r = resizeSplit(s, s.id, [0.01, 0.99]) as SplitNode;
    expect(r.sizes[0]).toBeGreaterThan(0.07);
    expect(r.sizes[0] + r.sizes[1]).toBeCloseTo(1);
  });

  it("normalize achata divisões aninhadas na mesma direção", () => {
    const n = normalize(split("row", [group(["files"]), split("row", [group(["git"]), group(["notes"])])], [0.5, 0.5])) as SplitNode;
    expect(shape(n)).toEqual({ row: ["files", "git", "notes"] });
    expect(n.sizes.map((x) => Math.round(x * 100))).toEqual([50, 25, 25]);
  });
});

describe("workspace: layout salvo", () => {
  it("limpa painel desconhecido, repetido e tamanhos inválidos", () => {
    const raw = {
      kind: "split",
      dir: "row",
      sizes: [1, "x"],
      children: [
        { kind: "group", tabs: ["files", "inexistente", "files"], active: "inexistente" },
        { kind: "group", tabs: ["files", "terminal"], active: "terminal" },
      ],
    };
    const n = sanitize(raw);
    expect(shape(n)).toEqual({ row: ["files", "terminal"] });
    expect(sanitize({ kind: "group", tabs: [] })).toBeNull();
    expect(sanitize("lixo")).toBeNull();
  });
});
