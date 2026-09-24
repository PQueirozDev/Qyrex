import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { redact, createLogger, initLogger } from "../../src/main/logger";
import { maskKey } from "../../src/main/security/secrets";

describe("redact (logs sem segredos)", () => {
  it.each([
    ["x-api-key sk-ant-api03-AbCdEf1234567890xyz", "sk-ant-api03"],
    ["Authorization: Bearer ya29.a0AfH6SMBxyz1234567890", "ya29.a0AfH6SMBxyz"],
    ["https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyA1234567890abcdefghijk", "AIzaSyA1234567890"],
    ['{"access_token":"BQD123456789abcdef","refresh_token":"AQC98765"}', "BQD123456789"],
    ["token ghp_1234567890abcdefghijABCDEFGHIJ", "ghp_1234567890abcdef"],
    ["github_pat_11ABCDEFG0123456789_abcdefghijklmnop", "11ABCDEFG0123456789"],
    ["client_secret=GOCSPX-abcdef123456", "GOCSPX-abcdef"],
  ])("mascara %s", (input, secret) => {
    const out = redact(input);
    expect(out).not.toContain(secret);
    expect(out).toContain("REDACTED");
  });

  it("mantém mensagens comuns intactas", () => {
    expect(redact("Projeto aberto: Aquecedores Fortes")).toBe("Projeto aberto: Aquecedores Fortes");
  });

  it("grava arquivo de log já redigido", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pqw-logs-"));
    initLogger(dir);
    createLogger("teste").error("falhou com key sk-proj-ABCDEFGHIJKLMNOP123");
    const [file] = fs.readdirSync(dir);
    const content = fs.readFileSync(path.join(dir, file), "utf-8");
    expect(content).toContain("[ERROR] [teste]");
    expect(content).not.toContain("ABCDEFGHIJKLMNOP123");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("maskKey", () => {
  it("nunca exibe a key inteira", () => {
    const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz";
    const masked = maskKey(key);
    expect(masked).not.toBe(key);
    expect(masked.length).toBeLessThan(key.length);
    expect(masked.startsWith("sk-a")).toBe(true);
  });

  it("keys curtas ficam totalmente ocultas", () => {
    expect(maskKey("abc123")).toBe("••••••••");
  });
});
