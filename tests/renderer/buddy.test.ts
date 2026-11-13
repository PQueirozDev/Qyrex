import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
vi.stubGlobal("document", { documentElement: { lang: "" } });
vi.stubGlobal("window", { setTimeout, clearTimeout, workspace: {} });

const { errorLines } = await import("../../src/renderer/components/buddy/answers");
const { useBuddyStore } = await import("../../src/renderer/stores/useBuddyStore");

describe("capivara: linhas de erro", () => {
  it("tira as cores, pega só linhas de erro e não repete", () => {
    const out = "\u001b[32mready\u001b[0m\n\u001b[31mError: porta 3000 em uso\u001b[0m\nok\nnpm ERR! missing script\nError: porta 3000 em uso\n";
    expect(errorLines(out)).toEqual(["Error: porta 3000 em uso", "npm ERR! missing script"]);
  });
});

describe("capivara: frequência das mensagens", () => {
  it("modo 'poucas' segura balões seguidos, mas falha sempre aparece; silêncio não fala", () => {
    const s = useBuddyStore.getState();
    s.setPrefs({ enabled: true, frequency: "few" });
    s.react({ kind: "taskDone", title: "A" });
    expect(useBuddyStore.getState().message).toContain("A");
    useBuddyStore.getState().react({ kind: "taskDone", title: "B" });
    expect(useBuddyStore.getState().message).toContain("A");
    useBuddyStore.getState().react({ kind: "buildFail", name: "build" });
    expect(useBuddyStore.getState().message).toContain("build");
    expect(useBuddyStore.getState().mood).toBe("worried");
    useBuddyStore.getState().dismiss();
    useBuddyStore.getState().setPrefs({ frequency: "silent" });
    useBuddyStore.getState().react({ kind: "processFail", name: "dev" });
    expect(useBuddyStore.getState().message).toBeNull();
    expect(useBuddyStore.getState().mood).toBe("error");
  });
});
