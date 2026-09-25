import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildActivity, decodeFrames, encodeFrame } from "../../src/main/integrations/discord";
import { CHANGELOG } from "../../src/shared/changelog";
import { settingsPatch, parse } from "../../src/main/security/validation";
import { getSettings, updateSettings } from "../../src/main/database/db";
import { freshDb } from "../helpers";

const ROOT = path.resolve(__dirname, "../..");

describe("Discord Rich Presence (protocolo IPC)", () => {
  it("codifica frames com opcode e tamanho little-endian", () => {
    const frame = encodeFrame(1, { cmd: "SET_ACTIVITY" });
    expect(frame.readInt32LE(0)).toBe(1);
    expect(frame.readInt32LE(4)).toBe(frame.length - 8);
    expect(JSON.parse(frame.subarray(8).toString())).toEqual({ cmd: "SET_ACTIVITY" });
  });

  it("decodifica frames concatenados e guarda o resto parcial", () => {
    const a = encodeFrame(1, { evt: "READY" });
    const b = encodeFrame(1, { evt: "ERROR" });
    const { frames, rest } = decodeFrames(Buffer.concat([a, b.subarray(0, 5)]));
    expect(frames).toEqual([{ op: 1, payload: { evt: "READY" } }]);
    expect(rest.length).toBe(5);
    const again = decodeFrames(Buffer.concat([rest, b.subarray(5)]));
    expect(again.frames[0].payload).toEqual({ evt: "ERROR" });
  });

  it("rejeita frame com tamanho absurdo", () => {
    const bad = Buffer.alloc(8);
    bad.writeInt32LE(1, 0);
    bad.writeInt32LE(50_000_000, 4);
    expect(() => decodeFrames(bad)).toThrow();
  });

  it("não expõe o nome do projeto sem permissão", () => {
    const hidden = buildActivity("projetos", "Cliente Secreto", false, "pt", 0);
    expect(JSON.stringify(hidden)).not.toContain("Cliente Secreto");
    expect(hidden.details).toBe("Gerenciando projetos");
    const shown = buildActivity("projetos", "Aquecedores", true, "en", 0);
    expect(shown.details).toBe("Managing projects");
    expect(shown.state).toBe("Project: Aquecedores");
  });
});

describe("atualizador: logs enxutos", () => {
  it("registra só a primeira linha do erro (nunca cabeçalhos/cookies da resposta)", async () => {
    const { firstLine } = await import("../../src/main/services/updateService");
    const err = new Error('HttpError: 404 \n"Headers": {\n  "set-cookie": ["_gh_sess=secreto"]\n}');
    expect(firstLine(err)).toBe("Error: HttpError: 404 ");
    expect(firstLine("x".repeat(1000)).length).toBe(300);
  });
});

describe("configurações novas (idioma, tema, Discord, atualização)", () => {
  beforeEach(() => freshDb());

  it("têm padrões seguros", () => {
    const s = getSettings();
    expect(s.language).toBe("pt");
    expect(s.autoUpdate).toBe(true);
    expect(s.discord).toEqual({ enabled: false, clientId: null, showProject: false });
    expect(s.lastSeenVersion).toBeNull();
  });

  it("persistem", () => {
    updateSettings({ language: "en", theme: "midnight", discord: { enabled: true, clientId: "123456789012345678", showProject: false } });
    const s = getSettings();
    expect(s.language).toBe("en");
    expect(s.theme).toBe("midnight");
    expect(s.discord.clientId).toBe("123456789012345678");
  });

  it("validação aceita os temas novos e rejeita valores inválidos", () => {
    for (const theme of ["dark", "light", "system", "midnight", "violet", "sand"]) {
      expect(() => parse(settingsPatch, { theme })).not.toThrow();
    }
    expect(() => parse(settingsPatch, { theme: "neon" })).toThrow();
    expect(() => parse(settingsPatch, { language: "es" })).toThrow();
    expect(parse(settingsPatch, { discord: { enabled: true, clientId: "1180485432179417149", showProject: false } }).discord?.clientId).toBe(
      "1180485432179417149"
    );
    expect(() => parse(settingsPatch, { discord: { enabled: true, clientId: "abc", showProject: false } })).toThrow();
    expect(() => parse(settingsPatch, { discord: { enabled: true, clientId: "12345", showProject: false } })).toThrow();
    expect(() => parse(settingsPatch, { lastSeenVersion: "1.0.0" })).not.toThrow();
    expect(() => parse(settingsPatch, { lastSeenVersion: "../../x" })).toThrow();
  });
});

describe("temas", () => {
  const css = fs.readFileSync(path.join(ROOT, "src/renderer/styles/index.css"), "utf8");
  const themesSrc = fs.readFileSync(path.join(ROOT, "src/renderer/lib/themes.ts"), "utf8");
  const ids = [...themesSrc.matchAll(/id: "(\w+)"/g)].map((m) => m[1]);

  it("catálogo tem os 5 temas", () => {
    expect(ids).toEqual(["dark", "light", "midnight", "violet", "sand"]);
  });

  it("todo tema adicional tem bloco de cores completo no CSS", () => {
    const tokens = ["--bg", "--bg-elevated", "--bg-card", "--bg-hover", "--border", "--text", "--text-muted", "--accent", "--accent-fg", "--danger", "--success"];
    for (const id of ["midnight", "violet", "sand"]) {
      const block = new RegExp(`:root\\[data-theme="${id}"\\] \\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1];
      expect(block, `bloco CSS de ${id}`).toBeTruthy();
      for (const token of tokens) expect(block).toContain(`${token}:`);
    }
  });
});

describe("patch notes e versão", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as { version: string };

  it("a versão do app tem entrada no changelog (a mais recente)", () => {
    expect(CHANGELOG[0].version).toBe(pkg.version);
  });

  it("versões em ordem decrescente e textos nos dois idiomas", () => {
    const cmp = (a: string, b: string) => {
      const [x, y] = [a, b].map((v) => v.split(".").map(Number));
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    };
    for (let i = 1; i < CHANGELOG.length; i++) expect(cmp(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0);
    for (const entry of CHANGELOG) {
      expect(entry.title.pt && entry.title.en).toBeTruthy();
      for (const section of entry.sections) for (const item of section.items) expect(item.pt && item.en).toBeTruthy();
    }
  });

  it("instalador publica só no repositório de releases, sem pré-releases", () => {
    const builder = JSON.parse(fs.readFileSync(path.join(ROOT, "electron-builder.json"), "utf8")) as {
      publish: { provider: string; owner: string; repo: string }[];
    };
    expect(builder.publish).toEqual([expect.objectContaining({ provider: "github", owner: "PQueirozDev", repo: "QrzSpace-releases" })]);
  });
});
