import { beforeEach, describe, expect, it } from "vitest";
import * as prompts from "../../src/main/services/promptService";
import { promptInput } from "../../src/main/security/validation";
import { freshDb } from "../helpers";

beforeEach(() => freshDb());

describe("prompts salvos", () => {
  it("cria, edita, ordena pelos mais usados e exclui", () => {
    const a = prompts.createPrompt({ title: "Revisar", content: "Revise:" });
    const b = prompts.createPrompt({ title: "Arrumar", content: "Arrume:" });
    prompts.markPromptUsed(b.id);
    expect(prompts.listPrompts().map((p) => p.id)).toEqual([b.id, a.id]);
    expect(prompts.updatePrompt(a.id, { title: "Revisar código" }).content).toBe("Revise:");
    prompts.deletePrompt(b.id);
    expect(prompts.listPrompts()).toHaveLength(1);
    expect(() => prompts.updatePrompt("nao", { title: "x" })).toThrow(/não encontrado/);
  });

  it("validação recusa prompt vazio", () => {
    expect(promptInput.safeParse({ title: "x", content: "   " }).success).toBe(false);
    expect(promptInput.safeParse({ title: "", content: "ok" }).success).toBe(false);
  });
});
