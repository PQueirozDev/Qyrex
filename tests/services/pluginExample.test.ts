import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseManifest } from "../../src/main/services/pluginService";

// O exemplo da documentação precisa ser um manifesto válido de verdade.
describe("plugins: exemplo da documentação", () => {
  it("docs/plugin-example/qyrex-plugin.json passa na validação", () => {
    const raw = fs.readFileSync(path.join(__dirname, "../../docs/plugin-example/qyrex-plugin.json"), "utf-8");
    const m = parseManifest(raw);
    expect(m.contributes.projectTemplates?.[0].id).toBe("lib-typescript");
    expect(m.contributes.quickLinks).toHaveLength(2);
  });
});
