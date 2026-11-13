import { describe, expect, it } from "vitest";
import type { DirEntry } from "../../src/shared/types";
import { authorizedFileRoot, compactFileRoots, fileAncestors, filePathKey, fileTreeKeyAction, isWithinFileRoot, visibleFileRows } from "../../src/renderer/lib/filesTree";
const folder = (path: string): DirEntry => ({ path, name: path.split(/[\\/]/).pop()!, isDirectory: true, size: 0, modifiedAt: "" });

describe("navegação da árvore de Arquivos", () => {
  it("respeita fronteiras de pasta, volume e caixa de cada sistema", () => {
    expect(isWithinFileRoot("C:\\Projetos\\api", "c:\\projetos\\")).toBe(true);
    expect(isWithinFileRoot("C:\\Projetos-antigos", "C:\\Projetos")).toBe(false);
    expect(isWithinFileRoot("D:\\Projetos\\api", "C:\\Projetos")).toBe(false);
    expect(isWithinFileRoot("/home/Ana/projeto", "/home/ana")).toBe(false);
    expect(authorizedFileRoot("C:\\Projetos\\api\\src", ["C:\\Projetos", "C:\\Projetos\\api"])).toBe("C:\\Projetos\\api");
  });
  it("revela apenas os ancestrais e deduplica raízes sobrepostas", () => {
    expect(fileAncestors("C:\\", "C:\\Projetos\\api")).toEqual(["C:\\", "C:\\Projetos", "C:\\Projetos\\api"]);
    expect(fileAncestors("/", "/projetos/api")).toEqual(["/", "/projetos", "/projetos/api"]);
    expect(fileAncestors("C:\\Projetos", "C:\\fora")).toEqual([]);
    expect(compactFileRoots(["C:\\Projetos", "c:\\projetos\\", "C:\\Projetos\\api", "D:\\"])).toEqual(["C:\\Projetos", "D:\\"]);
  });
  it("esconde descendentes recolhidos e protege a lista contra ciclos", () => {
    const root = folder("C:\\Projetos");
    const child = folder("C:\\Projetos\\api");
    const children = new Map([[filePathKey(root.path), [child, child]], [filePathKey(child.path), [root]]]);
    expect(visibleFileRows([root], new Set(), children).map((row) => row.entry.path)).toEqual([root.path]);
    const rows = visibleFileRows([root], new Set([filePathKey(root.path), filePathKey(child.path)]), children);
    expect(rows.map((row) => row.entry.path)).toEqual([root.path, child.path]);
    expect(rows[1]).toMatchObject({ depth: 1, siblings: 1, parentKey: rows[0].key });
  });
  it("move o foco pela hierarquia visível e expande antes de entrar", () => {
    const root = folder("C:\\Projetos"), child = folder("C:\\Projetos\\api");
    const key = filePathKey(root.path), childKey = filePathKey(child.path);
    const children = new Map([[key, [child]]]);
    const collapsed = visibleFileRows([root], new Set(), children);
    expect(fileTreeKeyAction(collapsed, key, "ArrowRight", new Set())).toEqual({ expand: key });
    const expanded = new Set([key]);
    const rows = visibleFileRows([root], expanded, children);
    expect(fileTreeKeyAction(rows, key, "ArrowRight", expanded)).toEqual({ focus: childKey });
    expect(fileTreeKeyAction(rows, childKey, "ArrowLeft", expanded)).toEqual({ focus: key });
    expect(fileTreeKeyAction(rows, key, "ArrowLeft", expanded)).toEqual({ collapse: key });
    expect(fileTreeKeyAction(rows, childKey, "Home", expanded)).toEqual({ focus: key });
    expect(fileTreeKeyAction(rows, key, "End", expanded)).toEqual({ focus: childKey });
  });
});
