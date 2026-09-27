import { describe, expect, it, vi } from "vitest";

// Os utilitários da UI leem o idioma do localStorage/document ao carregar.
vi.stubGlobal("localStorage", { getItem: () => "pt", setItem: () => undefined });
vi.stubGlobal("document", { documentElement: { lang: "" } });

const { fuzzyFilter, fuzzyScore, normalizeText } = await import("../../src/renderer/lib/fuzzy");
const { addDays, formatDuration, formatPhone, initials, parseLocalDateTime, relativeDay, toLocalDate, basename } = await import("../../src/renderer/lib/format");
const { getTheme, THEMES } = await import("../../src/renderer/lib/themes");

describe("fuzzy search (Ctrl+K)", () => {
  it("ignora acentos e maiúsculas", () => {
    expect(normalizeText("Ação Rápida")).toBe("acao rapida");
    expect(fuzzyScore("acao", "Nova ação")).not.toBeNull();
  });

  it("aceita letras em ordem e rejeita fora de ordem", () => {
    expect(fuzzyScore("nvtf", "Nova tarefa")).not.toBeNull();
    expect(fuzzyScore("zzz", "Nova tarefa")).toBeNull();
  });

  it("prioriza substring exata e início de palavra", () => {
    const items = ["Abrir terminal", "Terminal em Aquecedores", "Ir para Tarefas"];
    expect(fuzzyFilter(items, "term", (s) => s)[0]).toBe("Terminal em Aquecedores");
  });
});

describe("datas no horário local", () => {
  it("usa a data local, não UTC (23h de hoje continua sendo hoje)", () => {
    const late = new Date(2030, 0, 10, 23, 30);
    expect(toLocalDate(late)).toBe("2030-01-10");
  });

  it("relativeDay", () => {
    const today = new Date();
    expect(relativeDay(toLocalDate(today))).toBe("Hoje");
    expect(relativeDay(toLocalDate(addDays(today, 1)))).toBe("Amanhã");
    expect(relativeDay(toLocalDate(addDays(today, -1)))).toBe("Ontem");
  });

  it("parse e formatação", () => {
    const d = parseLocalDateTime("2030-05-07T14:05:00");
    expect([d.getHours(), d.getMinutes()]).toEqual([14, 5]);
    expect(formatDuration(103_000)).toBe("01:43");
    expect(basename("C:\\Projetos\\site\\index.html")).toBe("index.html");
  });
});

describe("telefone e iniciais", () => {
  it("formata telefones brasileiros e mantém o resto como veio", () => {
    expect(formatPhone("11900000001")).toBe("(11) 90000-0001");
    expect(formatPhone("1130000000")).toBe("(11) 3000-0000");
    expect(formatPhone("+55 11 90000-0001")).toBe("+55 (11) 90000-0001");
    expect(formatPhone("900000001")).toBe("90000-0001");
    expect(formatPhone("+1 415 555 0100")).toBe("+1 415 555 0100");
  });

  it("iniciais da primeira e da última palavra", () => {
    expect(initials("Studio Nova Pilates")).toBe("SP");
    expect(initials("Café Aurora")).toBe("CA");
    expect(initials("Pedro")).toBe("P");
    expect(initials("   ", "Q")).toBe("Q");
  });
});

describe("temas", () => {
  it("'Sistema' segue o modo do Windows", () => {
    expect(getTheme("system", true).id).toBe("dark");
    expect(getTheme("system", false).id).toBe("light");
  });

  it("temas escuros e claros marcados corretamente", () => {
    expect(THEMES.filter((t) => t.dark).map((t) => t.id)).toEqual(["dark", "midnight", "violet"]);
    expect(THEMES.filter((t) => !t.dark).map((t) => t.id)).toEqual(["light", "sand"]);
  });
});
