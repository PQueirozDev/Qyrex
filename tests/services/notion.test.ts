import { describe, expect, it } from "vitest";
import { blockToMarkdown, richToMarkdown, textToBlocks, titleOf, toItem } from "../../src/main/integrations/notion";

const rt = (plain_text: string, annotations = {}, href: string | null = null) => ({ plain_text, annotations, href });

describe("Notion: conversão para Markdown", () => {
  it("formata negrito, itálico, código e links (só http/https)", () => {
    expect(richToMarkdown([rt("oi", { bold: true }), rt(" "), rt("x", { code: true }), rt(" site", {}, "https://a.com"), rt(" ruim", {}, "javascript:alert(1)")])).toBe(
      "**oi** `x`[ site](https://a.com) ruim"
    );
  });

  it("converte os blocos mais comuns", () => {
    const b = (type: string, extra: Record<string, unknown> = {}) => ({ id: "1", type, [type]: { rich_text: [rt("texto")], ...extra } });
    expect(blockToMarkdown(b("heading_2"))).toBe("## texto");
    expect(blockToMarkdown(b("bulleted_list_item"), 1)).toBe("  - texto");
    expect(blockToMarkdown(b("to_do", { checked: true }))).toBe("- [x] texto");
    expect(blockToMarkdown(b("quote"))).toBe("> texto");
    expect(blockToMarkdown(b("code", { language: "typescript" }))).toBe("```typescript\ntexto\n```");
    expect(blockToMarkdown({ id: "2", type: "divider", divider: {} })).toBe("---");
    expect(blockToMarkdown({ id: "3", type: "bookmark", bookmark: { url: "javascript:x" } })).toBe("");
  });

  it("lê o título de páginas e de bancos", () => {
    const page = { object: "page" as const, id: "p", url: "u", last_edited_time: "t", properties: { Nome: { type: "title", title: [rt("Minha página")] } }, icon: { type: "emoji", emoji: "📄" } };
    expect(titleOf(page)).toBe("Minha página");
    expect(toItem(page)).toMatchObject({ type: "page", title: "Minha página", icon: "📄" });
    expect(titleOf({ object: "database", id: "d", url: "u", last_edited_time: "t", title: [] })).toBe("Sem título");
  });
});

describe("Notion: texto para blocos", () => {
  it("reconhece títulos, listas, tarefas e citações", () => {
    const blocks = textToBlocks("# Título\n- item\n- [x] feito\n1. primeiro\n> nota\n\nparágrafo");
    expect(blocks.map((b) => b.type)).toEqual(["heading_1", "bulleted_list_item", "to_do", "numbered_list_item", "quote", "paragraph"]);
    expect((blocks[2].to_do as { checked: boolean }).checked).toBe(true);
  });

  it("respeita os limites do Notion (100 blocos, 2000 caracteres por trecho)", () => {
    expect(textToBlocks(Array.from({ length: 150 }, (_, i) => `linha ${i}`).join("\n"))).toHaveLength(100);
    const [long] = textToBlocks("a".repeat(4500));
    expect((long.paragraph as { rich_text: unknown[] }).rich_text).toHaveLength(3);
  });
});
