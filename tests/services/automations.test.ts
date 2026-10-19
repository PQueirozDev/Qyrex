import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, updateSettings } from "../../src/main/database/db";
import * as auto from "../../src/main/services/automationService";
import { createProject } from "../../src/main/services/projectService";
import { listActivity } from "../../src/main/services/recentService";
import { freshDb, removeDir, tempAllowedDir } from "../helpers";

const isWin = process.platform === "win32";
let dir: string;
let projectId: string;
const noOpen = async () => undefined;

beforeEach(() => {
  freshDb();
  dir = tempAllowedDir("pqw-auto-");
  fs.mkdirSync(path.join(dir, "app"));
  projectId = createProject({ name: "App", localPath: path.join(dir, "app") }).id;
});

afterEach(() => removeDir(dir));

describe("automações: cadastro", () => {
  it("cria com risco calculado pelo main e lista por projeto", () => {
    const a = auto.createAutomation({
      name: "Checar",
      projectId,
      steps: [
        { kind: "command", command: "  git status  " },
        { kind: "command", command: "Remove-Item -Recurse dist" },
        { kind: "open", target: "vscode" },
      ],
    });
    expect(a.enabled).toBe(true);
    expect(a.steps[0]).toMatchObject({ kind: "command", command: "git status", assessment: { risk: "safe" } });
    expect(a.steps[1].assessment.risk).toBe("dangerous");
    expect(a.steps[2].assessment.risk).toBe("safe");
    expect(auto.listAutomations(projectId).map((x) => x.id)).toEqual([a.id]);
    // A avaliação nunca é gravada: é recalculada a cada leitura.
    const raw = (getDb().prepare("SELECT steps FROM automations WHERE id = ?").get(a.id) as { steps: string }).steps;
    expect(raw).not.toContain("assessment");
  });

  it("recusa projeto inexistente e some junto com o projeto", () => {
    expect(() => auto.createAutomation({ name: "X", projectId: "nao", steps: [{ kind: "open", target: "vscode" }] })).toThrow(/Projeto não encontrado/);
    auto.createAutomation({ name: "X", projectId, steps: [{ kind: "open", target: "vscode" }] });
    getDb().prepare("DELETE FROM projects WHERE id = ?").run(projectId);
    expect(auto.listAutomations()).toHaveLength(0);
  });

  it("sugestões vêm dos scripts do package.json e do git", () => {
    fs.writeFileSync(path.join(dir, "app", "package.json"), JSON.stringify({ scripts: { test: "x", lint: "x", build: "x" } }));
    fs.writeFileSync(path.join(dir, "app", "pnpm-lock.yaml"), "");
    fs.mkdirSync(path.join(dir, "app", ".git"));
    const names = auto.suggestAutomations(projectId);
    expect(names.map((s) => s.name)).toEqual(["Abrir ambiente de trabalho", "Rodar testes", "Verificar o projeto", "Checagem do Git"]);
    expect(names[2].steps).toEqual([
      { kind: "command", command: "pnpm run lint" },
      { kind: "command", command: "pnpm run build" },
    ]);
  });
});

describe.skipIf(!isWin)("automações: execução (PowerShell)", () => {
  it("roda os passos na pasta do projeto e guarda saída e código", async () => {
    const opened: string[] = [];
    const a = auto.createAutomation({
      name: "Ok",
      projectId,
      steps: [
        { kind: "command", command: "Write-Output (Split-Path -Leaf (Get-Location))" },
        { kind: "open", target: "explorer" },
      ],
    });
    const run = await auto.runAutomation(a.id, async (target, cwd) => {
      opened.push(`${target}:${path.basename(cwd)}`);
    });
    expect(run.status).toBe("success");
    expect(run.steps[0]).toMatchObject({ status: "success", exitCode: 0 });
    expect(run.steps[0].stdout.trim()).toBe("app");
    expect(opened).toEqual(["explorer:app"]);
    expect(auto.listRuns(a.id)[0].status).toBe("success");
    expect(auto.getAutomation(a.id)?.lastRun?.id).toBe(run.id);
    expect(listActivity(5, "automation")[0].label).toBe("Ok");
  });

  it("para no primeiro passo que falha e pula o resto", async () => {
    const a = auto.createAutomation({
      name: "Falha",
      projectId,
      steps: [
        { kind: "command", command: "Write-Error 'quebrou'; exit 3" },
        { kind: "command", command: "Write-Output nunca" },
      ],
    });
    const run = await auto.runAutomation(a.id, noOpen);
    expect(run.status).toBe("failed");
    expect(run.steps[0]).toMatchObject({ status: "failed", exitCode: 3 });
    expect(run.steps[0].stderr).toContain("quebrou");
    expect(run.steps[1].status).toBe("skipped");
  });

  it("cancelar interrompe o passo em andamento", async () => {
    const a = auto.createAutomation({ name: "Longa", projectId, steps: [{ kind: "command", command: "Start-Sleep -Seconds 30" }, { kind: "command", command: "Write-Output depois" }] });
    const pending = auto.runAutomation(a.id, noOpen);
    await new Promise((r) => setTimeout(r, 600));
    expect(auto.isRunning(a.id)).toBe(true);
    await expect(auto.runAutomation(a.id, noOpen)).rejects.toThrow(/já está rodando/);
    expect(auto.cancelRun(a.id)).toBe(true);
    const run = await pending;
    expect(run.status).toBe("cancelled");
    expect(run.steps[1].status).toBe("skipped");
    expect(auto.isRunning(a.id)).toBe(false);
  }, 20_000);

  it("cancelar encerra também os processos filhos do comando", async () => {
    const late = path.join(dir, "app", "tarde.txt");
    const a = auto.createAutomation({
      name: "Filho",
      projectId,
      steps: [{ kind: "command", command: `node -e "setTimeout(() => require('fs').writeFileSync('tarde.txt', 'x'), 2500)"` }],
    });
    const pending = auto.runAutomation(a.id, noOpen);
    await new Promise((r) => setTimeout(r, 900));
    auto.cancelRun(a.id);
    expect((await pending).status).toBe("cancelled");
    await new Promise((r) => setTimeout(r, 3000));
    expect(fs.existsSync(late)).toBe(false);
  }, 20_000);

  it("desativada não roda e pasta fora da allowlist é recusada", async () => {
    const a = auto.createAutomation({ name: "Off", projectId, enabled: false, steps: [{ kind: "command", command: "Write-Output x" }] });
    await expect(auto.runAutomation(a.id, noOpen)).rejects.toThrow(/desativada/);
    auto.updateAutomation(a.id, { enabled: true });
    updateSettings({ allowedProjectDirs: [] });
    await expect(auto.runAutomation(a.id, noOpen)).rejects.toThrow(/Acesso negado/);
    expect(auto.listRuns(a.id)).toHaveLength(0);
  });
});

describe("automações: histórico", () => {
  it("execução que ficou rodando quando o app fechou vira interrompida", () => {
    const a = auto.createAutomation({ name: "X", projectId, steps: [{ kind: "open", target: "vscode" }] });
    getDb().prepare("INSERT INTO automation_runs (id, automation_id, started_at, status) VALUES ('r1', ?, '2026-01-01T00:00:00Z', 'running')").run(a.id);
    auto.markInterruptedRuns();
    expect(auto.listRuns(a.id)[0]).toMatchObject({ status: "cancelled" });
    expect(auto.recentRuns()[0]).toMatchObject({ automationName: "X", projectId });
  });
});
