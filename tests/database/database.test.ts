import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSettings, runMigrations, updateSettings } from "../../src/main/database/db";
import * as tasks from "../../src/main/services/taskService";
import * as projects from "../../src/main/services/projectService";
import * as clients from "../../src/main/services/clientService";
import * as marketing from "../../src/main/services/marketingService";
import * as calendar from "../../src/main/services/calendarService";
import { listActivity } from "../../src/main/services/recentService";
import { globalSearch } from "../../src/main/services/searchService";
import { freshDb, MIGRATIONS_DIR, removeDir, tempAllowedDir } from "../helpers";

let dir: string;

beforeEach(() => {
  freshDb();
  dir = tempAllowedDir();
});

afterEach(() => removeDir(dir));

describe("migrations", () => {
  it("são idempotentes", () => {
    const db = freshDb();
    expect(runMigrations(db, MIGRATIONS_DIR)).toEqual([]);
  });

  it("criam todas as entidades da spec", () => {
    const db = freshDb();
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);
    for (const t of [
      "user_settings",
      "projects",
      "tasks",
      "clients",
      "marketing_content",
      "calendar_events",
      "integrations",
      "ai_conversations",
      "ai_messages",
      "recent_items",
      "notification_log",
      "allowed_commands",
    ]) {
      expect(tables).toContain(t);
    }
  });
});

describe("settings", () => {
  it("tem valores padrão sensatos", () => {
    freshDb();
    const s = getSettings();
    expect(s.theme).toBe("dark");
    expect(s.allowedProjectDirs).toEqual([]);
    expect(s.onboardingCompleted).toBe(false);
    expect(s.notifications).toEqual({ tasks: true, events: true, billing: true, marketing: true });
  });

  it("persiste alterações parciais", () => {
    updateSettings({ userName: "Pedro", defaultTerminal: "cmd", notifications: { tasks: false, events: true, billing: true, marketing: false } });
    const s = getSettings();
    expect(s.userName).toBe("Pedro");
    expect(s.defaultTerminal).toBe("cmd");
    expect(s.notifications.tasks).toBe(false);
    expect(s.allowedProjectDirs).toEqual([dir]);
  });
});

describe("tarefas", () => {
  it("cria com padrões e ordena por prazo/prioridade", () => {
    tasks.createTask({ title: "Sem prazo" });
    tasks.createTask({ title: "Amanhã", dueDate: "2030-01-02" });
    tasks.createTask({ title: "Hoje urgente", dueDate: "2030-01-01", priority: "urgente" });
    const list = tasks.listTasks();
    expect(list.map((t) => t.title)).toEqual(["Hoje urgente", "Amanhã", "Sem prazo"]);
    expect(list[2].status).toBe("pendente");
    expect(list[2].priority).toBe("normal");
  });

  it("registra conclusão e atividade", () => {
    const t = tasks.createTask({ title: "Corrigir site", tags: ["site"] });
    const done = tasks.updateTaskStatus(t.id, "concluido");
    expect(done.completedAt).not.toBeNull();
    expect(listActivity(5)[0]).toMatchObject({ itemType: "task_completed", label: "Corrigir site" });
    const reopened = tasks.updateTask(t.id, { status: "em_andamento" });
    expect(reopened.completedAt).toBeNull();
  });

  it("filtra por status e projeto", () => {
    fs.mkdirSync(path.join(dir, "site"));
    const p = projects.createProject({ name: "Site", localPath: path.join(dir, "site") });
    tasks.createTask({ title: "A", projectId: p.id });
    tasks.createTask({ title: "B", status: "concluido" });
    expect(tasks.listTasks({ projectId: p.id }).map((t) => t.title)).toEqual(["A"]);
    expect(tasks.listTasks({ status: "concluido" }).map((t) => t.title)).toEqual(["B"]);
  });

  it("falha ao atualizar tarefa inexistente", () => {
    expect(() => tasks.updateTask("nao-existe", { title: "x" })).toThrow(/não encontrada/);
  });
});

describe("projetos", () => {
  it("detecta tecnologias pelo package.json", async () => {
    const projDir = path.join(dir, "aquecedores");
    fs.mkdirSync(projDir);
    fs.writeFileSync(
      path.join(projDir, "package.json"),
      JSON.stringify({ name: "aquecedores-fortes", dependencies: { react: "18", "@supabase/supabase-js": "2" }, devDependencies: { typescript: "5" } })
    );
    const detection = await projects.detectProject(projDir);
    expect(detection.name).toBe("aquecedores-fortes");
    expect(detection.technologies).toEqual(expect.arrayContaining(["React", "TypeScript", "Supabase"]));

    const p = projects.createProject({ name: "Aquecedores Fortes", localPath: projDir });
    expect(p.technologies).toEqual(expect.arrayContaining(["React", "Supabase"]));
  });

  it("recusa pastas fora dos diretórios autorizados", () => {
    expect(() => projects.createProject({ name: "X", localPath: path.join(dir, "..") })).toThrow(/Acesso negado/);
  });

  it("recusa cadastro duplicado da mesma pasta", () => {
    fs.mkdirSync(path.join(dir, "p"));
    projects.createProject({ name: "P", localPath: path.join(dir, "p") });
    expect(() => projects.createProject({ name: "P2", localPath: path.join(dir, "p") })).toThrow(/já está cadastrada/);
  });

  it("favorito e última abertura afetam a ordem", () => {
    fs.mkdirSync(path.join(dir, "a"));
    fs.mkdirSync(path.join(dir, "b"));
    const a = projects.createProject({ name: "A", localPath: path.join(dir, "a") });
    const b = projects.createProject({ name: "B", localPath: path.join(dir, "b") });
    projects.touchLastOpened(a.id);
    expect(projects.listProjects()[0].id).toBe(a.id);
    projects.toggleFavorite(b.id);
    expect(projects.listProjects()[0].id).toBe(b.id);
    expect(listActivity(5, "project")[0].label).toBe("A");
  });

  it("excluir o projeto não apaga a pasta", () => {
    fs.mkdirSync(path.join(dir, "keep"));
    const p = projects.createProject({ name: "Keep", localPath: path.join(dir, "keep") });
    projects.deleteProject(p.id);
    expect(fs.existsSync(path.join(dir, "keep"))).toBe(true);
  });
});

describe("clientes", () => {
  it("busca trata % e _ como texto literal", () => {
    clients.createClient({ name: "Aquecedores Fortes", company: "AF Ltda" });
    clients.createClient({ name: "Loja 100%" });
    expect(clients.listClients("100%").map((c) => c.name)).toEqual(["Loja 100%"]);
    expect(clients.listClients("%")).toHaveLength(1);
    expect(clients.listClients("_")).toHaveLength(0);
    expect(clients.listClients("aquec")).toHaveLength(1);
  });

  it("pasta de arquivos do cliente precisa estar autorizada", () => {
    const c = clients.createClient({ name: "C" });
    expect(() => clients.updateClient(c.id, { filesPath: "C:\\Windows" })).toThrow();
    expect(clients.updateClient(c.id, { filesPath: dir }).filesPath).toBe(dir);
  });
});

describe("marketing e agenda", () => {
  it("filtra conteúdo por período", () => {
    marketing.createMarketingContent({ title: "Post terça", type: "post", scheduledDate: "2030-05-07" });
    marketing.createMarketingContent({ title: "Reel", type: "reel", scheduledDate: "2030-06-01" });
    marketing.createMarketingContent({ title: "Ideia solta", type: "story" });
    expect(marketing.listMarketingContent({ from: "2030-05-01", to: "2030-05-31" }).map((m) => m.title)).toEqual(["Post terça"]);
    expect(marketing.listMarketingContent()[2].status).toBe("ideia");
  });

  it("lista eventos que cruzam o intervalo e valida término", () => {
    calendar.createEvent({ title: "Faculdade", startsAt: "2030-01-10T09:00:00", endsAt: "2030-01-10T12:00:00" });
    calendar.createEvent({ title: "Antigo", startsAt: "2029-12-01T09:00:00" });
    const events = calendar.listEvents({ from: "2030-01-10T00:00:00", to: "2030-01-10T23:59:59" });
    expect(events.map((e) => e.title)).toEqual(["Faculdade"]);
    expect(() => calendar.createEvent({ title: "X", startsAt: "2030-01-10T10:00:00", endsAt: "2030-01-10T09:00:00" })).toThrow();
  });

  it("eventos do Google são somente leitura", () => {
    calendar.replaceGoogleEvents({ from: "2030-01-01T00:00:00", to: "2030-12-31T23:59:59" }, [
      { externalId: "g1", title: "Reunião", description: null, startsAt: "2030-02-01T14:00:00", endsAt: null, location: null },
    ]);
    const [ev] = calendar.listEvents();
    expect(ev.source).toBe("google");
    expect(() => calendar.deleteEvent(ev.id)).toThrow(/Google/);
    expect(() => calendar.updateEvent(ev.id, { title: "x" })).toThrow(/Google/);
  });
});

describe("busca global", () => {
  it("encontra itens em todas as categorias", () => {
    fs.mkdirSync(path.join(dir, "aquecedores-site"));
    fs.writeFileSync(path.join(dir, "aquecedores-site", "logo-aquecedores.png"), "x");
    projects.createProject({ name: "Aquecedores Fortes", localPath: path.join(dir, "aquecedores-site") });
    tasks.createTask({ title: "Post aquecedores" });
    clients.createClient({ name: "Aquecedores Fortes" });
    marketing.createMarketingContent({ title: "Reel aquecedores", type: "reel" });

    const r = globalSearch("aquecedores");
    expect(r.projects).toHaveLength(1);
    expect(r.tasks).toHaveLength(1);
    expect(r.clients).toHaveLength(1);
    expect(r.marketing).toHaveLength(1);
    expect(r.files.map((f) => f.name)).toEqual(expect.arrayContaining(["aquecedores-site", "logo-aquecedores.png"]));
  });

  it("ignora consultas curtas demais", () => {
    expect(globalSearch("a").projects).toEqual([]);
  });
});
