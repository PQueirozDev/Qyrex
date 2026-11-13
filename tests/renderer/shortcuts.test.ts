import { describe, expect, it } from "vitest";
import { actionFor, comboOf, defaultShortcuts, sanitizeShortcuts } from "../../src/renderer/lib/shortcuts";

const ev = (key: string, mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...mods,
});

describe("atalhos", () => {
  it("monta a combinação e ignora teclas sem Ctrl/Alt ou só modificadores", () => {
    expect(comboOf(ev("k", { ctrlKey: true }))).toBe("Ctrl+K");
    expect(comboOf(ev("T", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+T");
    expect(comboOf(ev("a"))).toBeNull();
    expect(comboOf(ev("Shift", { shiftKey: true, ctrlKey: true }))).toBeNull();
  });

  it("acha a ação pelo mapa padrão", () => {
    const map = defaultShortcuts();
    expect(actionFor(map, "Ctrl+K")).toBe("palette");
    expect(actionFor(map, "Ctrl+Shift+W")).toBe("workspace");
    expect(actionFor(map, "Ctrl+J")).toBeNull();
  });

  it("limpa o que veio do storage: ação desconhecida, combinação sem Ctrl/Alt e repetida", () => {
    const map = sanitizeShortcuts({ palette: "Ctrl+P", quickTask: "T", projects: "Ctrl+P", inventado: "Ctrl+X" });
    expect(map.palette).toBe("Ctrl+P");
    expect(map.quickTask).toBe("Ctrl+Shift+T");
    expect(map.projects).toBe("Ctrl+Shift+P");
    expect(Object.keys(map)).not.toContain("inventado");
  });
});
