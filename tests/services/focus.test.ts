import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, updateSettings } from "../../src/main/database/db";
import * as focus from "../../src/main/services/focusService";
import { createProject } from "../../src/main/services/projectService";
import { listActivity } from "../../src/main/services/recentService";
import { freshDb, removeDir, tempAllowedDir } from "../helpers";

let dir: string;
const at = (iso: string) => new Date(iso);
const t0 = at("2026-10-18T13:00:00.000Z");
const plus = (min: number, sec = 0) => new Date(t0.getTime() + (min * 60 + sec) * 1000);

beforeEach(() => {
  freshDb();
  dir = tempAllowedDir("pqw-focus-");
});

afterEach(() => {
  // Os timers do relógio são limpos ao encerrar/cancelar; garante que nada fica rodando.
  if (focus.getState().session) focus.cancel();
  removeDir(dir);
});

describe("sessões de foco", () => {
  it("conta o tempo com pausa e retomada", () => {
    focus.start({ minutes: 25 }, t0);
    expect(focus.getState(plus(5)).elapsedSeconds).toBe(300);
    focus.pause(plus(5));
    // Pausado: o relógio não anda.
    expect(focus.getState(plus(30)).elapsedSeconds).toBe(300);
    focus.resume(plus(30));
    expect(focus.getState(plus(32)).elapsedSeconds).toBe(420);
    const done = focus.finish(plus(32));
    expect(done?.status).toBe("completed");
    expect(done?.focusedSeconds).toBe(420);
    expect(focus.getState().session).toBeNull();
  });

  it("nunca passa do tempo planejado", () => {
    focus.start({ minutes: 25 }, t0);
    expect(focus.getState(plus(90)).elapsedSeconds).toBe(1500);
    expect(focus.finish(plus(90))?.focusedSeconds).toBe(1500);
  });

  it("só uma sessão por vez, e ações sem sessão dão erro claro", () => {
    focus.start({ minutes: 10 }, t0);
    expect(() => focus.start({ minutes: 10 }, t0)).toThrow(/em andamento/);
    expect(() => focus.resume(t0)).toThrow(/pausada/);
    focus.cancel(plus(1));
    expect(() => focus.pause(t0)).toThrow(/rodando/);
    expect(() => focus.cancel(t0)).toThrow(/em andamento/);
    expect(focus.finish(t0)).toBeNull();
  });

  it("cancelada não entra no resumo; encerrada entra no dia e no projeto", () => {
    fs.mkdirSync(path.join(dir, "p"));
    const p = createProject({ name: "Projeto Foco", localPath: path.join(dir, "p") });
    const now = new Date();
    const ago = (min: number) => new Date(now.getTime() - min * 60_000);

    focus.start({ minutes: 25, projectId: p.id }, ago(40));
    focus.finish(ago(20)); // 20 min
    focus.start({ minutes: 25 }, ago(15));
    focus.cancel(ago(5)); // descartada

    const summary = focus.getSummary(7, now);
    expect(summary.days).toHaveLength(7);
    expect(summary.completedSessions).toBe(1);
    expect(summary.totalSeconds).toBe(1200);
    expect(summary.byProject).toEqual([{ projectId: p.id, name: "Projeto Foco", seconds: 1200 }]);
    expect(summary.recent[0].projectName).toBe("Projeto Foco");
    expect(listActivity(5, "focus")[0].label).toBe("Projeto Foco");
  });

  it("a sessão ativa aparece no resumo de hoje", () => {
    const now = new Date();
    focus.start({ minutes: 50 }, new Date(now.getTime() - 10 * 60_000));
    expect(focus.getSummary(7, now).todaySeconds).toBe(600);
  });

  it("meta diária vem das configurações", () => {
    updateSettings({ focus: { minutes: 25, dailyGoalMinutes: 120, notify: true } });
    expect(focus.getSummary().dailyGoalMinutes).toBe(120);
  });

  it("checkpoint grava o trecho atual e a abertura recupera a sessão pausada sem inventar tempo", () => {
    focus.start({ minutes: 25 }, t0);
    focus.checkpoint(plus(7));
    // Simula o app fechando sem aviso: a sessão fica "running" no banco.
    focus.recoverOnStartup();
    const st = focus.getState(plus(120));
    expect(st.session?.status).toBe("paused");
    expect(st.elapsedSeconds).toBe(420);
  });

  it("recuperação encerra a sessão que já tinha completado o planejado", () => {
    focus.start({ minutes: 5 }, t0);
    focus.checkpoint(plus(9));
    focus.recoverOnStartup();
    expect(focus.getState().session).toBeNull();
    const row = getDb().prepare("SELECT status, focused_seconds AS s FROM focus_sessions").get();
    expect(row).toEqual({ status: "completed", s: 300 });
  });

  it("sair do app pausa a sessão rodando", () => {
    focus.start({ minutes: 25 }, new Date(Date.now() - 60_000));
    focus.pauseOnQuit();
    expect(focus.getState().session?.status).toBe("paused");
  });
});
